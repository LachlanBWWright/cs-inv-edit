import { createEffect, createResource, createSignal } from "solid-js";
import type { ConnectionStatus, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import { AppView } from "./AppView.js";
import { createOperationApi } from "./lib/api.js";
export type { AppBackendClient } from "./lib/backend.js";
export * from "./lib/result-http.js";

import type { AppBackendClient } from "./lib/backend.js";
import type { ToastItem } from "./components/ui/ToastViewport.js";

export interface AppProps {
  backend: AppBackendClient;
  platform: "desktop" | "web";
}

export function App(props: AppProps) {
  const [view, setView] = createSignal("inventory");
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>();
  const [statusMessage, setStatusMessage] = createSignal<string>("");
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);

  const [health] = createResource(() => props.backend.health());
  const [inventory, { refetch: refetchInventory }] = createResource(() => props.backend.inventory());
  const [receipts, { refetch: refetchOperations }] = createResource(() => props.backend.operations());
  const [events, { refetch: refetchEvents }] = createResource(() => props.backend.events());
  const [settings, { refetch: refetchSettings }] = createResource(() => props.backend.settings());
  const [connection, { refetch: refetchConnection }] = createResource(() => props.backend.steamStatus?.() ?? Promise.resolve({ state: "disconnected" as const }));

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4000);
  };

  const logSteamDiagnostics = (label: string, status?: ConnectionStatus) => {
    if (!status?.diagnostics?.length) return;
    console.groupCollapsed(`[steam] ${label} diagnostics`);
    for (const line of status.diagnostics) {
      console.info(line);
    }
    console.groupEnd();
  };

  createEffect(() => {
    logSteamDiagnostics("status", connection());
  });

  let steamGuardPollTimer: number | undefined;
  let steamGuardPollInFlight = false;
  const pollSteamGuardMobileApproval = async () => {
    if (steamGuardPollInFlight || connection()?.state !== "needs_steam_guard" || !props.backend.submitSteamGuard) {
      return;
    }
    steamGuardPollInFlight = true;
    try {
      const res = await props.backend.submitSteamGuard({ code: "" });
      console.info("[app] Steam Guard mobile poll result", res);
      logSteamDiagnostics("steam guard mobile poll", res);
      if (res.state === "connected") {
        if (steamGuardPollTimer !== undefined) {
          window.clearInterval(steamGuardPollTimer);
          steamGuardPollTimer = undefined;
        }
        setView("inventory");
        await syncAccountState(res);
      } else if (res.state === "error") {
        console.info("[app] Steam Guard mobile approval still pending or transiently unavailable", res);
      } else {
        await refetchConnection();
      }
    } catch (error) {
      console.info("[app] Steam Guard mobile approval pending", error);
    } finally {
      steamGuardPollInFlight = false;
    }
  };

  createEffect(() => {
    if (steamGuardPollTimer !== undefined) {
      window.clearInterval(steamGuardPollTimer);
      steamGuardPollTimer = undefined;
    }
    steamGuardPollInFlight = false;
    if (connection()?.state !== "needs_steam_guard" || !props.backend.submitSteamGuard) {
      return;
    }
    void pollSteamGuardMobileApproval();
    steamGuardPollTimer = window.setInterval(() => {
      void pollSteamGuardMobileApproval();
    }, 2000);
  });

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  createEffect(() => {
    if (connection() && connection()?.state !== "connected" && view() !== "settings") {
      setView("account");
    }
  });

  createEffect(() => {
    const currentSettings = settings();
    if (!currentSettings || currentSettings.featureFlags.enableNameTags) {
      return;
    }
    console.info("[app] enabling name-tag workflow by default");
    void props.backend.submitOperation("settings", {
      ...currentSettings,
      featureFlags: { ...currentSettings.featureFlags, enableNameTags: true },
    }).then(() => refetchSettings()).catch((error) => {
      console.error("[app] failed to enable name-tag workflow", error);
      pushToast({ title: "Defaults updated", description: "Name-tag editing could not be enabled automatically.", variant: "warning" });
    });
  });

  const notifyOperationReceipt = (receipt: OperationReceipt) => {
    if (receipt.type === "containers.open") {
      return;
    }
    const base = receipt.message ?? receipt.type;
    if (receipt.state === "completed") {
      pushToast({ title: "Operation completed", description: base, variant: "success" });
    } else if (receipt.state === "awaiting_gc_confirmation") {
      pushToast({ title: "Awaiting confirmation", description: base, variant: "warning" });
    } else if (receipt.state === "failed") {
      pushToast({ title: "Operation failed", description: base, variant: "danger" });
    } else if (receipt.state === "blocked_by_feature_flag" || receipt.state === "requires_validation") {
      pushToast({ title: "Operation blocked", description: base, variant: "warning" });
    } else {
      pushToast({ title: "Operation updated", description: base });
    }
  };

  const settleOperation = async (receiptPromise: Promise<OperationReceipt>) => {
    try {
      const receipt = await receiptPromise;
      console.info("[app] operation receipt", receipt);
      notifyOperationReceipt(receipt);
      if (receipt.type !== "containers.open" && (receipt.state === "completed" || receipt.state === "awaiting_gc_confirmation")) {
        await props.backend.refreshInventory();
        await refetchInventory();
      } else if (receipt.type === "containers.open") {
        await refetchInventory();
      }
      await Promise.all([refetchOperations(), refetchEvents()]);
      return receipt;
    } catch (error) {
      console.error("[app] operation failed", error);
      pushToast({ title: "Operation error", description: error instanceof Error ? error.message : "Unknown operation error", variant: "danger" });
      return Promise.reject(error);
    }
  };

  const refreshAll = async () => {
    setStatusMessage("Refreshing backend state");
    console.info("[app] refreshing backend state");
    try {
      await Promise.all([refetchInventory(), refetchOperations(), refetchEvents(), refetchSettings(), refetchConnection()]);
      pushToast({ title: "Inventory refreshed", description: "The latest backend state is now loaded.", variant: "success" });
    } catch (error) {
      console.error("[app] refresh failed", error);
      pushToast({ title: "Refresh failed", description: error instanceof Error ? error.message : "Unable to refresh state", variant: "danger" });
      return Promise.reject(error);
    } finally {
      setStatusMessage("");
    }
  };

  const syncAccountState = async (latestStatus?: ConnectionStatus) => {
    console.info("[app] syncing account state");
    const refreshedStatus = await refetchConnection();
    const status = latestStatus ?? refreshedStatus;
    if (status?.state === "connected") {
      setView("inventory");
      console.info("[app] connection ready, refreshing inventory");
      let inventoryRefreshFailed = false;
      try {
        const refreshPromise = props.backend.refreshInventory();
        await new Promise((resolve) => window.setTimeout(resolve, 25));
        await refetchInventory();
        await refreshPromise;
        await refetchInventory();
      } catch (error) {
        inventoryRefreshFailed = true;
        console.error("[app] inventory refresh after sign-in failed", error);
        pushToast({ title: "Inventory refresh failed", description: error instanceof Error ? error.message : "Unable to refresh inventory after sign-in", variant: "danger" });
      }
      pushToast({ title: "Account connected", description: inventoryRefreshFailed ? "Signed in successfully. Inventory still needs attention." : "Inventory is ready to inspect and edit.", variant: "success" });
      return;
    }
    setView("account");
  };

  const operationApi = createOperationApi(props.backend);

  const saveSettings = async (next: SettingsData) => {
    console.info("[app] saving settings", next);
    await props.backend.submitOperation("settings", next);
    await refetchSettings();
    pushToast({ title: "Settings updated", description: "The latest backend settings are saved.", variant: "success" });
  };

  const handleSwitchAccount = async () => {
    setSelectedItemId(undefined);
    console.info("[app] switching account");
    if (props.backend.disconnectSteam) {
      await props.backend.disconnectSteam();
    }
    await refetchConnection();
    setView("account");
    pushToast({ title: "Account disconnected", description: "You can sign in with a different Steam account.", variant: "warning" });
  };

  return (
    <AppView
      view={view()}
      setView={setView}
      selectedItemId={selectedItemId()}
      setSelectedItemId={setSelectedItemId}
      statusMessage={statusMessage()}
      health={health()}
      connection={connection()}
      inventory={inventory()}
      settings={settings()}
      receipts={receipts()}
      events={events()}
      toasts={toasts()}
      platform={props.platform}
      onSwitchAccount={() => void handleSwitchAccount()}
      onRefreshInventory={() => void refreshAll()}
      onDismissToast={dismissToast}
      onConnect={async (input) => {
        try {
          if (props.backend.connectSteam) {
            console.info("[app] connecting Steam account", input);
            const res = await props.backend.connectSteam(input);
            console.info("[app] connect result", res);
            logSteamDiagnostics("connect", res);
            if (res.state === "error") return Promise.reject(new Error(res.detail || "Connection failed"));
            if (res.state === "connected") {
              setView("inventory");
            }
            await syncAccountState(res);
          } else {
            await syncAccountState();
          }
        } catch (error) {
          console.error("[app] connect failed", error);
          pushToast({ title: "Sign-in failed", description: error instanceof Error ? error.message : "Unable to sign in to Steam", variant: "danger" });
          return Promise.reject(error);
        }
      }}
      onSubmitSteamGuard={async (input) => {
        try {
          if (props.backend.submitSteamGuard) {
            console.info("[app] submitting Steam Guard code");
            const res = await props.backend.submitSteamGuard(input);
            console.info("[app] Steam Guard result", res);
            logSteamDiagnostics("steam guard", res);
            if (res.state === "error") return Promise.reject(new Error(res.detail || "Steam Guard failed"));
            if (res.state === "connected") {
              setView("inventory");
            }
            await syncAccountState(res);
          } else {
            await syncAccountState();
          }
        } catch (error) {
          console.error("[app] steam guard failed", error);
          pushToast({ title: "Steam Guard failed", description: error instanceof Error ? error.message : "Unable to verify the code", variant: "danger" });
          return Promise.reject(error);
        }
      }}
      onDisconnect={async () => {
        try {
          console.info("[app] disconnecting Steam account");
          if (props.backend.disconnectSteam) await props.backend.disconnectSteam();
          await refetchConnection();
          setView("account");
          pushToast({ title: "Account disconnected", description: "The session has been cleared.", variant: "warning" });
        } catch (error) {
          console.error("[app] disconnect failed", error);
          pushToast({ title: "Disconnect failed", description: error instanceof Error ? error.message : "Unable to disconnect", variant: "danger" });
          return Promise.reject(error);
        }
      }}
      onToast={pushToast}
      onInventoryRefresh={() => void refreshAll()}
      onInventoryRename={(input) => settleOperation(operationApi.applyNameTag(input))}
      onRemoveName={(input) => settleOperation(operationApi.removeNameTag(input))}
      onOpenContainer={(input) => settleOperation(props.backend.submitOperation("containers.open", input))}
      onStorageSubmit={(type, input) => settleOperation(props.backend.submitOperation(type, input))}
      onTradeUpSubmit={(type, input) => settleOperation(props.backend.submitOperation(type, input))}
      onStickerSubmit={(type, input) => settleOperation(props.backend.submitOperation(type, input))}
      onNameTagApply={(input) => settleOperation(operationApi.applyNameTag(input))}
      onNameTagRemove={(input) => settleOperation(operationApi.removeNameTag(input))}
      onToolApplyStatTrakSwap={(input) => settleOperation(operationApi.applyStatTrakSwap(input))}
      onToolApplyStrangePart={(input) => settleOperation(operationApi.applyStrangePart(input))}
      onToolApplyToolToItem={(input) => settleOperation(operationApi.applyToolToItem(input))}
      onToolApplyToolToBaseItem={(input) => settleOperation(operationApi.applyToolToBaseItem(input))}
      onItemDelete={(input) => settleOperation(operationApi.deleteItem(input))}
      onItemUse={(input) => settleOperation(operationApi.useItem(input))}
      onItemUseMultiple={(input) => settleOperation(operationApi.useMultipleItems(input))}
      onItemGift={(input) => settleOperation(operationApi.giftItem(input))}
      onSaveSettings={saveSettings}
    />
  );
}
