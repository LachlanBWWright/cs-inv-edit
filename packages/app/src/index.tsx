import { createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { errAsync } from "neverthrow";
import type { ResultAsync } from "neverthrow";
import { steamAccountProfilesSchema, type ArmorySnapshot, type ConnectionStatus, type OperationReceipt, type RelatedItemDto, type SettingsData, type SteamAccountProfile } from "@cs-inv-edit/contracts";
import { AppView } from "./AppView.js";
import { createOperationApi } from "./lib/api.js";
export type { AppBackendClient } from "./lib/backend.js";
export * from "./lib/result-http.js";

import type { AppBackendClient } from "./lib/backend.js";
import type { ToastItem } from "./components/ui/ToastViewport.js";
import { appErrorMessage, fromAppPromise } from "./lib/result.js";
import type { AppError } from "./lib/result-http.js";
import { enabledModeOrDefault, type AppScreen } from "./view.js";
import { createArmoryRefresher, createInventoryRefresher } from "./lib/loading-refresh.js";

export interface AppProps {
  backend: AppBackendClient;
  platform: "desktop" | "web";
}

const accountStorageKey = "cs-inv-edit.steam-accounts.v1";

function loadSteamAccounts(): SteamAccountProfile[] {
  try {
    const parsed = steamAccountProfilesSchema.safeParse(JSON.parse(window.localStorage.getItem(accountStorageKey) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function App(props: AppProps) {
  const [view, setView] = createSignal<AppScreen>("inventory");
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>();
  const [query, setQuery] = createSignal("");
  const [kindFilter, setKindFilter] = createSignal<"all" | import("@cs-inv-edit/contracts").InventoryItemDto["kind"]>("all");
  const [compactMode, setCompactMode] = createSignal<"icons" | "concise" | "detailed">("concise");
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);
  const [accounts, setAccounts] = createSignal<SteamAccountProfile[]>(loadSteamAccounts());
  const [accountUsername, setAccountUsername] = createSignal("");
  const [inventoryRefreshActive, setInventoryRefreshActive] = createSignal(false);

  const resourceValue = <T,>(result: ResultAsync<T, AppError>) => result.match((value) => value, (error) => { console.error(error.message, error.cause); return undefined; });
  const [health] = createResource(() => resourceValue(props.backend.health()));
  const [settings, { refetch: refetchSettings }] = createResource(() => resourceValue(props.backend.settings()));
  const [inventory, { refetch: refetchInventory }] = createResource(() => resourceValue(props.backend.inventory()));
  const [tf2Inventory, { refetch: refetchTF2Inventory }] = createResource(() => settings()?.featureFlags.enableTf2Inventory ? "tf2" as const : false, (game) => resourceValue(props.backend.gameInventory(game)));
  const [dota2Inventory, { refetch: refetchDota2Inventory }] = createResource(() => settings()?.featureFlags.enableDota2Inventory ? "dota2" as const : false, (game) => resourceValue(props.backend.gameInventory(game)));
  const [armory, { refetch: refetchArmory, mutate: setArmory }] = createResource(() => resourceValue(props.backend.armory()));
  const [receipts, { refetch: refetchOperations }] = createResource(() => resourceValue(props.backend.operations()));
  const [events, { refetch: refetchEvents }] = createResource(() => resourceValue(props.backend.events()));
  const [connection, { refetch: refetchConnection, mutate: setConnection }] = createResource(() => resourceValue(props.backend.steamStatus?.() ?? errAsync({ message: "Steam status unavailable" })));

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4000);
  };

  const refreshInventoryState = createInventoryRefresher({ backend: props.backend, refetch: refetchInventory, setActive: setInventoryRefreshActive, pushToast });
  const refreshArmoryState = createArmoryRefresher({
    backend: props.backend,
    refetch: refetchArmory,
    pushToast,
    markLoading: () => setArmory((current): ArmorySnapshot => ({
      balance: current?.balance ?? 0,
      generationTime: current?.generationTime ?? 0,
      itemIds: current?.itemIds ?? [],
      offers: current?.offers ?? [],
      refreshedAt: current?.refreshedAt ?? new Date().toISOString(),
      status: "loading",
      diagnostics: current?.diagnostics,
    })),
  });
  const marketPreviewCache = new Map<string, Promise<RelatedItemDto | undefined>>();
  const requestMarketPreview = (marketName: string) => {
    const cached = marketPreviewCache.get(marketName);
    if (cached) return cached;
    const request = props.backend.marketPreview(marketName).match((preview) => preview, () => undefined).then((preview) => {
      if (!preview) marketPreviewCache.delete(marketName);
      return preview;
    });
    marketPreviewCache.set(marketName, request);
    return request;
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

  createEffect(() => {
    const flags = settings()?.featureFlags;
		const current = view();
		if (current !== "account" && enabledModeOrDefault(current, flags) !== current) {
      setSelectedItemId(undefined);
      setView("inventory");
    }
  });

	let selectionScope = "";
	createEffect(() => {
		const nextScope = `${connection()?.steamId ?? "disconnected"}\u0000${view()}`;
		if (selectionScope && selectionScope !== nextScope) setSelectedItemId(undefined);
		selectionScope = nextScope;
	});

	let automaticGameRefresh = "";
	createEffect(() => {
		const game = view() === "tf2-inventory" ? "tf2" : view() === "dota2-inventory" ? "dota2" : undefined;
		const steamId = connection()?.state === "connected" ? connection()?.steamId : undefined;
		if (!game || !steamId) return;
		const enabled = game === "tf2" ? settings()?.featureFlags.enableTf2Inventory : settings()?.featureFlags.enableDota2Inventory;
		const key = `${steamId}\u0000${game}`;
		if (!enabled || automaticGameRefresh === key) return;
		automaticGameRefresh = key;
		void props.backend.refreshGameInventory(game)
			.andThen(() => fromAppPromise(Promise.resolve(game === "tf2" ? refetchTF2Inventory() : refetchDota2Inventory()), `${game} inventory reload failed`))
			.match(() => undefined, (error) => pushToast({ title: "Inventory refresh failed", description: appErrorMessage(error, `Unable to refresh ${game} inventory`), variant: "danger" }));
	});

  let automaticArmoryRefresh = "";
  createEffect(() => {
    const steamId = connection()?.state === "connected" ? connection()?.steamId : undefined;
    if (view() !== "armory" || !steamId || armory()?.status === "ready") return;
    const key = `${steamId}\u0000armory`;
    if (automaticArmoryRefresh === key) return;
    automaticArmoryRefresh = key;
    void refreshArmoryState();
  });

  createEffect(() => {
    const snapshot = armory();
    if (snapshot) console.info("[armory] validated snapshot", snapshot);
  });

  createEffect(() => {
    window.localStorage.setItem(accountStorageKey, JSON.stringify(accounts()));
  });

  createEffect(() => {
    const status = connection();
    if (!status) return;
    if (status.state !== "connected" || !status.accountName) {
      setAccounts((current) => current.map((account) => ({ ...account, signedIn: false })));
      return;
    }
    setAccounts((current) => {
      const next = current.map((account) => ({ ...account, signedIn: false }));
      const index = next.findIndex((account) => account.accountName.toLowerCase() === status.accountName!.toLowerCase());
      const profile: SteamAccountProfile = {
        accountName: status.accountName!,
        steamId: status.steamId,
        avatarUrl: status.avatarUrl,
        signedIn: true,
        lastSignedInAt: new Date().toISOString(),
      };
      if (index >= 0) next[index] = { ...next[index], ...profile };
      else next.unshift(profile);
      return next;
    });
  });

  const stopSteamStatus = props.backend.watchSteamStatus?.((status) => {
    const wasConnected = connection()?.state === "connected";
    setConnection(status);
    if (!wasConnected && status.state === "connected") {
      setView("inventory");
      void syncAccountState(status);
    }
  });
  onCleanup(() => stopSteamStatus?.());

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  createEffect(() => {
    // Inventory authentication opens the account view by default, but Armory has
    // its own disconnected state and must remain directly navigable from Mode.
    if (connection() && connection()?.state !== "connected" && view() !== "armory") {
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
    }).andThen(() => fromAppPromise(Promise.resolve(refetchSettings()), "Failed to refresh settings")).match(() => undefined, (error) => {
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

  const settleOperation = async (receiptResult: ResultAsync<OperationReceipt, AppError>): Promise<OperationReceipt> => {
    return receiptResult.andThen((receipt) => {
      console.info("[app] operation receipt", receipt);
      notifyOperationReceipt(receipt);
      if (receipt.type !== "containers.open" && (receipt.state === "completed" || receipt.state === "awaiting_gc_confirmation")) {
        return props.backend.refreshInventory().andThen(() => fromAppPromise(Promise.resolve(refetchInventory()), "Inventory reload failed")).map(() => receipt);
      } else if (receipt.type === "containers.open") {
        return fromAppPromise(Promise.resolve(refetchInventory()), "Inventory reload failed").map(() => receipt);
      }
      return fromAppPromise(Promise.resolve(receipt));
    }).andThen((receipt) => fromAppPromise(Promise.all([refetchOperations(), refetchEvents()]), "Operation state refresh failed").map(() => receipt)).match((receipt) => receipt, (error) => {
      console.error("[app] operation failed", error);
      const message = appErrorMessage(error, "Unknown operation error");
      pushToast({ title: "Operation error", description: message, variant: "danger" });
      return { operationId: `failed-${Date.now()}`, type: "operation.error", state: "failed", createdAt: new Date().toISOString(), message };
    });
  };

  const syncAccountState = async (latestStatus?: ConnectionStatus) => {
    console.info("[app] syncing account state");
    const refreshedStatus = await refetchConnection();
    const status = latestStatus ?? refreshedStatus;
    if (status?.state === "connected") {
      setView("inventory");
      console.info("[app] connection ready, refreshing inventory");
      const inventoryRefreshFailed = await refreshInventoryState();
      if (!inventoryRefreshFailed) {
        await refreshArmoryState();
      }
      pushToast({ title: "Account connected", description: inventoryRefreshFailed ? "Signed in successfully. Inventory still needs attention." : "Inventory is ready to inspect and edit.", variant: "success" });
      return;
    }
    setView("account");
  };

  const operationApi = createOperationApi(props.backend);

  const disconnectAndRefresh = async () => {
    if (!props.backend.disconnectSteam) return;
    await props.backend.disconnectSteam()
      .andThen(() => fromAppPromise(Promise.resolve(refetchConnection()), "Connection reload failed"))
      .match(() => undefined, (error) => pushToast({ title: "Disconnect failed", description: appErrorMessage(error, "Unable to disconnect"), variant: "danger" }));
  };

  const saveSettings = async (next: SettingsData) => {
    console.info("[app] saving settings", next);
    await props.backend.submitOperation("settings", next)
      .andThen(() => fromAppPromise(Promise.resolve(refetchSettings()), "Settings reload failed"))
      .match(() => pushToast({ title: "Settings updated", description: "The latest backend settings are saved.", variant: "success" }), (error) => pushToast({ title: "Settings update failed", description: appErrorMessage(error, "Unable to save settings"), variant: "danger" }));
  };

  const addAccount = async () => {
    if (connection()?.state === "connected" && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    setSelectedItemId(undefined);
    setAccountUsername("");
    setView("account");
  };

  const signInAccount = async (account: SteamAccountProfile) => {
    if (connection()?.state === "connected" && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    setSelectedItemId(undefined);
    setAccountUsername(account.accountName);
    setView("account");
  };

  const signOutAccount = async (account: SteamAccountProfile) => {
    if (account.signedIn && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    setAccounts((current) => current.map((candidate) => candidate.accountName === account.accountName ? { ...candidate, signedIn: false } : candidate));
    setSelectedItemId(undefined);
    pushToast({ title: "Account signed out", description: account.accountName, variant: "warning" });
  };

  const deleteAccount = async (account: SteamAccountProfile) => {
    if (account.signedIn && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    setAccounts((current) => current.filter((candidate) => candidate.accountName !== account.accountName));
    setSelectedItemId(undefined);
    pushToast({ title: "Saved account deleted", description: `${account.accountName} was removed from this device.`, variant: "warning" });
  };

  return (
    <AppView
      view={view()}
      setView={setView}
      selectedItemId={selectedItemId()}
      setSelectedItemId={setSelectedItemId}
      statusMessage=""
      health={health()}
      connection={connection()}
      accounts={accounts()}
      accountUsername={accountUsername()}
      inventory={inventory()}
      inventoryLoading={inventoryRefreshActive() || inventory.loading}
      tf2Inventory={tf2Inventory()}
      dota2Inventory={dota2Inventory()}
      armory={armory()}
      settings={settings()}
      query={query()}
      setQuery={setQuery}
      kindFilter={kindFilter()}
      setKindFilter={setKindFilter}
      compactMode={compactMode()}
      setCompactMode={setCompactMode}
      receipts={receipts()}
      events={events()}
      toasts={toasts()}
      platform={props.platform}
      onAddAccount={() => void addAccount()}
      onSignInAccount={(account) => void signInAccount(account)}
      onSignOutAccount={(account) => void signOutAccount(account)}
      onDeleteAccount={(account) => void deleteAccount(account)}
      onRefreshInventory={() => void refreshInventoryState()}
      onDismissToast={dismissToast}
      onConnect={async (input) => {
        setAccountUsername(input.username ?? "");
        const result: ResultAsync<ConnectionStatus, AppError> = props.backend.connectSteam
          ? props.backend.connectSteam(input)
          : errAsync({ message: "Steam connection unavailable" });
        await result.andThen((res) => {
            console.info("[app] connecting Steam account", input);
            console.info("[app] connect result", res);
            logSteamDiagnostics("connect", res);
            if (res.state === "error") return errAsync({ message: res.detail || "Connection failed" });
            if (res.state === "connected") {
              setView("inventory");
            }
            return fromAppPromise(syncAccountState(res), "Account synchronization failed");
          }).match(() => undefined, (error) => {
          console.error("[app] connect failed", error);
          pushToast({ title: "Sign-in failed", description: appErrorMessage(error, "Unable to sign in to Steam"), variant: "danger" });
        });
      }}
      onStartSteamQR={async () => {
        const result = props.backend.startSteamQR ? props.backend.startSteamQR() : errAsync<ConnectionStatus, AppError>({ message: "Steam QR login unavailable" });
        await result.match((status) => setConnection(status), (error) => pushToast({ title: "QR sign-in failed", description: appErrorMessage(error, "Unable to start QR sign-in"), variant: "danger" }));
      }}
      onSubmitSteamGuard={async (input) => {
        const result: ResultAsync<ConnectionStatus, AppError> = props.backend.submitSteamGuard
          ? props.backend.submitSteamGuard(input)
          : errAsync({ message: "Steam Guard unavailable" });
        await result.andThen((res) => {
            console.info("[app] submitting Steam Guard code");
            console.info("[app] Steam Guard result", res);
            logSteamDiagnostics("steam guard", res);
            if (res.state === "error") return errAsync({ message: res.detail || "Steam Guard failed" });
            if (res.state === "connected") {
              setView("inventory");
            }
            return fromAppPromise(syncAccountState(res), "Account synchronization failed");
          }).match(() => undefined, (error) => {
          console.error("[app] steam guard failed", error);
          pushToast({ title: "Steam Guard failed", description: appErrorMessage(error, "Unable to verify the code"), variant: "danger" });
        });
      }}
      onDisconnect={async () => {
        console.info("[app] disconnecting Steam account");
        const disconnect = props.backend.disconnectSteam?.() ?? errAsync<ConnectionStatus, AppError>({ message: "Disconnect unavailable" });
        await disconnect.andThen(() => fromAppPromise(Promise.resolve(refetchConnection()), "Connection reload failed")).match(() => {
          setView("account");
          pushToast({ title: "Account disconnected", description: "The session has been cleared.", variant: "warning" });
        }, (error) => {
          console.error("[app] disconnect failed", error);
          pushToast({ title: "Disconnect failed", description: appErrorMessage(error, "Unable to disconnect"), variant: "danger" });
        });
      }}
      onToast={pushToast}
      onInventoryRefresh={() => void refreshInventoryState()}
      onGameInventoryRefresh={(game) => void props.backend.refreshGameInventory(game).andThen(() => fromAppPromise(Promise.resolve(game === "tf2" ? refetchTF2Inventory() : refetchDota2Inventory()), `${game} inventory reload failed`)).match(() => undefined, (error) => pushToast({ title: "Inventory refresh failed", description: appErrorMessage(error, `Unable to refresh ${game} inventory`), variant: "danger" }))}
      onArmoryRefresh={refreshArmoryState}
      onMarketPreview={requestMarketPreview}
      onArmoryRedeem={(input) => settleOperation(props.backend.redeemArmory(input)).then(async (receipt) => { await refetchArmory(); return receipt; })}
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
