import { createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { errAsync, fromThrowable } from "neverthrow";
import type { ResultAsync } from "neverthrow";
import { steamAccountProfilesSchema, type ArmorySnapshot, type ConnectionStatus, type RelatedItemDto, type SettingsData, type SteamAccountProfile, type SteamTradesSnapshot, type StoreSnapshot } from "@cs-inv-edit/contracts";
import type { AppBackendClient } from "./lib/backend.js";
import { appErrorMessage, fromAppPromise } from "./lib/result.js";
import type { AppError } from "./lib/result-http.js";
import { enabledModeOrDefault, isAppMode, type AppMode, type AppScreen } from "./view.js";
import { createArmoryRefresher, createInventoryRefresher } from "./lib/loading-refresh.js";
import { createShellController } from "./features/shell/controller.js";
import { createToastController } from "./features/notifications/controller.js";
import { createOperationsController } from "./features/operations/controller.js";

export interface AppProps {
  backend: AppBackendClient;
  platform: "desktop" | "web";
}

const accountStorageKey = "cs-inv-edit.steam-accounts.v1";

const writeModeToUrl = fromThrowable(
  (mode: AppMode) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", mode);
    url.searchParams.delete("returnTo");
    window.history.replaceState(window.history.state, "", url);
  },
  (cause) => ({ message: "Unable to update the selected mode URL", cause }),
);

const writeLoginToUrl = fromThrowable(
  (returnTo: AppMode) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "account");
    url.searchParams.set("returnTo", returnTo);
    window.history.replaceState(window.history.state, "", url);
  },
  (cause) => ({ message: "Unable to update the login URL", cause }),
);

function modeFromUrl(): AppMode {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view");
  if (isAppMode(requestedView)) return requestedView;
  const returnTo = params.get("returnTo");
  return isAppMode(returnTo) ? returnTo : "inventory";
}

function screenFromUrl(): AppScreen {
  return new URLSearchParams(window.location.search).get("view") === "account" ? "account" : modeFromUrl();
}

function loadSteamAccounts(): SteamAccountProfile[] {
  try {
    const parsed = steamAccountProfilesSchema.safeParse(JSON.parse(window.localStorage.getItem(accountStorageKey) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function createAppController(props: AppProps) {
  const shell = createShellController(screenFromUrl());
  shell.setAccounts(loadSteamAccounts());
  const toastController = createToastController();
  const [inventoryRefreshActive, setInventoryRefreshActive] = createSignal(false);

  const resourceValue = <T,>(result: ResultAsync<T, AppError>) => result.match((value) => value, (error) => { console.error(error.message, error.cause); return undefined; });
  const [health] = createResource(() => resourceValue(props.backend.health()));
  const [settings, { refetch: refetchSettings }] = createResource(() => resourceValue(props.backend.settings()));

  let protocolTraceCursor = 0;
  let protocolTracePolling = false;
  const pollProtocolTrace = () => {
    if (protocolTracePolling || !props.backend.protocolTrace || settings()?.featureFlags.enableProtocolConsole === false) return;
    protocolTracePolling = true;
    void props.backend.protocolTrace(protocolTraceCursor).match((entries) => {
      for (const entry of entries) {
        protocolTraceCursor = Math.max(protocolTraceCursor, entry.id);
        console.groupCollapsed(`[protobuf ${entry.direction}] ${entry.layer} ${entry.name} emsg=${entry.emsg}${entry.appId ? ` appid=${entry.appId}` : ""}`);
        console.debug(entry);
        if (entry.decoded !== undefined) console.debug("decoded protobuf", entry.decoded);
        if (entry.decodeError) console.warn("protobuf decode unavailable", entry.decodeError);
        console.debug(`body (${entry.bodyBytes} bytes): ${entry.bodyHex}`);
        console.groupEnd();
      }
      protocolTracePolling = false;
    }, (error) => {
      protocolTracePolling = false;
      console.warn("[protobuf trace] polling failed", error);
    });
  };
  const protocolTraceTimer = globalThis.setInterval(pollProtocolTrace, 750);
  onCleanup(() => globalThis.clearInterval(protocolTraceTimer));
  const [inventory, { refetch: refetchInventory }] = createResource(() => resourceValue(props.backend.inventory()));
  const [steamInventory, { refetch: refetchSteamInventory }] = createResource(() => settings()?.featureFlags.enableSteamInventory ? "steam" as const : false, (game) => resourceValue(props.backend.gameInventory(game)));
  const [tf2Inventory, { refetch: refetchTF2Inventory }] = createResource(() => settings()?.featureFlags.enableTf2Inventory ? "tf2" as const : false, (game) => resourceValue(props.backend.gameInventory(game)));
  const [dota2Inventory, { refetch: refetchDota2Inventory }] = createResource(() => settings()?.featureFlags.enableDota2Inventory ? "dota2" as const : false, (game) => resourceValue(props.backend.gameInventory(game)));
  const [armory, { refetch: refetchArmory, mutate: setArmory }] = createResource(() => resourceValue(props.backend.armory()));
  const [store, { refetch: refetchStore, mutate: setStore }] = createResource(() => resourceValue(props.backend.store()));
  const [trades, { mutate: setTrades }] = createResource(() => resourceValue(props.backend.trades()));
  const [receipts, { refetch: refetchOperations }] = createResource(() => resourceValue(props.backend.operations()));
  const [events, { refetch: refetchEvents }] = createResource(() => resourceValue(props.backend.events()));
  const [connection, { refetch: refetchConnection, mutate: setConnection }] = createResource(() => resourceValue(props.backend.steamStatus?.() ?? errAsync({ message: "Steam status unavailable" })));

  const pushToast = toastController.pushToast;

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
    const currentSettings = settings();
    if (!currentSettings) return;
    const flags = currentSettings.featureFlags;
    const current = shell.view();
    if (current !== "account" && enabledModeOrDefault(current, flags) !== current) {
      shell.setSelectedItemId(undefined);
      shell.setView("inventory");
    }
  });

  createEffect(() => {
    const current = shell.view();
    if (current === "account") return;
    writeModeToUrl(current).match(
      () => undefined,
      (error) => console.warn("[app] selected mode URL could not be updated", error),
    );
  });

  let selectionScope = "";
  createEffect(() => {
    const nextScope = `${connection()?.steamId ?? "disconnected"}\u0000${shell.view()}`;
    if (selectionScope && selectionScope !== nextScope) shell.setSelectedItemId(undefined);
    selectionScope = nextScope;
  });

  let automaticGameRefresh = "";
  createEffect(() => {
    const game = shell.view() === "steam-inventory" ? "steam" : shell.view() === "tf2-inventory" ? "tf2" : shell.view() === "dota2-inventory" ? "dota2" : undefined;
    const steamId = connection()?.state === "connected" ? connection()?.steamId : undefined;
    if (!game || !steamId) {
      automaticGameRefresh = "";
      return;
    }
    const enabled = game === "steam" ? settings()?.featureFlags.enableSteamInventory : game === "tf2" ? settings()?.featureFlags.enableTf2Inventory : settings()?.featureFlags.enableDota2Inventory;
    const refetchGame = () => game === "steam" ? refetchSteamInventory() : game === "tf2" ? refetchTF2Inventory() : refetchDota2Inventory();
    const key = `${steamId}\u0000${game}`;
    if (!enabled || automaticGameRefresh === key) return;
    automaticGameRefresh = key;
    void props.backend.refreshGameInventory(game)
      .andThen((receipt) => receipt.state === "failed" || receipt.state === "requires_connection" || receipt.state === "blocked_by_feature_flag"
        ? errAsync({ message: receipt.message ?? `${game} inventory refresh failed` })
        : fromAppPromise(Promise.resolve(refetchGame()), `${game} inventory reload failed`))
      .match(() => undefined, (error) => {
        automaticGameRefresh = "";
        void refetchGame();
        pushToast({ title: "Inventory refresh failed", description: appErrorMessage(error, `Unable to refresh ${game} inventory`), variant: "danger" });
      });
  });

  let automaticArmoryRefresh = "";
  createEffect(() => {
    const steamId = connection()?.state === "connected" ? connection()?.steamId : undefined;
    if (shell.view() !== "armory" || !steamId || armory()?.status === "ready") return;
    const key = `${steamId}\u0000armory`;
    if (automaticArmoryRefresh === key) return;
    automaticArmoryRefresh = key;
    void refreshArmoryState();
  });
  let automaticStoreRefresh = "";
  const refreshStoreState = async () => { setStore((current): StoreSnapshot => ({ status: "loading", offers: current?.offers ?? [], refreshedAt: current?.refreshedAt ?? new Date().toISOString(), priceSheetVersion: current?.priceSheetVersion, currency: current?.currency, message: "Requesting the current GC price sheet" })); await props.backend.refreshStore().andThen(() => fromAppPromise(Promise.resolve(refetchStore()), "Store reload failed")).match(() => undefined, (error) => { const message = appErrorMessage(error, "Unable to refresh store"); setStore((current): StoreSnapshot => ({ status: "error", offers: current?.offers ?? [], refreshedAt: new Date().toISOString(), priceSheetVersion: current?.priceSheetVersion, currency: current?.currency, message })); pushToast({ title: "Store refresh failed", description: message, variant: "danger" }); }); };
  createEffect(() => { const steamId = connection()?.state === "connected" ? connection()?.steamId : undefined; const enabled = settings()?.featureFlags.enableStoreRead === true; if (shell.view() !== "store" || !steamId || !enabled || store()?.status === "ready") return; const key = `${steamId}\u0000store\u0000${enabled}`; if (automaticStoreRefresh === key) return; automaticStoreRefresh = key; void refreshStoreState(); });
  let automaticTradeRefresh = "";
  const refreshTradesState = async () => { setTrades((current): SteamTradesSnapshot => ({ status: "loading", received: current?.received ?? [], sent: current?.sent ?? [], history: current?.history ?? [], refreshedAt: current?.refreshedAt ?? new Date().toISOString(), message: "Loading Steam trades" })); await props.backend.refreshTrades().match((snapshot) => setTrades(snapshot), (error) => setTrades((current): SteamTradesSnapshot => ({ status: "error", received: current?.received ?? [], sent: current?.sent ?? [], history: current?.history ?? [], refreshedAt: new Date().toISOString(), message: appErrorMessage(error, "Unable to load trades") }))); };
  createEffect(() => { const steamId = connection()?.state === "connected" ? connection()?.steamId : undefined; if (shell.view() !== "trades" || !steamId) return; const key = `${steamId}\u0000trades`; if (automaticTradeRefresh === key) return; automaticTradeRefresh = key; void refreshTradesState(); });

  createEffect(() => {
    const snapshot = armory();
    if (snapshot) console.info("[armory] validated snapshot", snapshot);
  });

  createEffect(() => {
    window.localStorage.setItem(accountStorageKey, JSON.stringify(shell.accounts()));
  });

  createEffect(() => {
    const status = connection();
    if (!status) return;
    if (status.state !== "connected" || !status.accountName) {
      shell.setAccounts((current) => current.map((account) => ({ ...account, signedIn: false })));
      return;
    }
    shell.setAccounts((current) => {
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
      shell.setView(enabledModeOrDefault(modeFromUrl(), settings()?.featureFlags));
      void syncAccountState(status);
    }
  });
  onCleanup(() => stopSteamStatus?.());

  const dismissToast = toastController.dismissToast;

  createEffect(() => {
    const currentView = shell.view();
    if (connection() && connection()?.state !== "connected" && currentView !== "account") {
      const returnTo = currentView;
      writeLoginToUrl(returnTo).match(
        () => undefined,
        (error) => console.warn("[app] login URL could not be updated", error),
      );
      shell.setView("account");
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

  const syncAccountState = async (latestStatus?: ConnectionStatus) => {
    console.info("[app] syncing account state");
    const refreshedStatus = await refetchConnection();
    const status = latestStatus ?? refreshedStatus;
    if (status?.state === "connected") {
      shell.setView(enabledModeOrDefault(modeFromUrl(), settings()?.featureFlags));
      console.info("[app] connection ready, refreshing inventory");
      const inventoryRefreshFailed = await refreshInventoryState();
      if (!inventoryRefreshFailed) {
        await refreshArmoryState();
      }
      pushToast({ title: "Account connected", description: inventoryRefreshFailed ? "Signed in successfully. Inventory still needs attention." : "Inventory is ready to inspect and edit.", variant: "success" });
      return;
    }
    shell.setView("account");
  };

  const operationController = createOperationsController({
    backend: props.backend,
    pushToast,
    refreshInventory: () => props.backend.refreshInventory().andThen(() => fromAppPromise(Promise.resolve(refetchInventory()), "Inventory reload failed")),
    refetchOperations: () => refetchOperations(),
    refetchEvents: () => refetchEvents(),
  });

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
    shell.setSelectedItemId(undefined);
    shell.setAccountUsername("");
    shell.setView("account");
  };

  const signInAccount = async (account: SteamAccountProfile) => {
    if (connection()?.state === "connected" && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    shell.setSelectedItemId(undefined);
    shell.setAccountUsername(account.accountName);
    shell.setView("account");
  };

  const signOutAccount = async (account: SteamAccountProfile) => {
    if (account.signedIn && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    shell.setAccounts((current) => current.map((candidate) => candidate.accountName === account.accountName ? { ...candidate, signedIn: false } : candidate));
    shell.setSelectedItemId(undefined);
    pushToast({ title: "Account signed out", description: account.accountName, variant: "warning" });
  };

  const deleteAccount = async (account: SteamAccountProfile) => {
    if (account.signedIn && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    shell.setAccounts((current) => current.filter((candidate) => candidate.accountName !== account.accountName));
    shell.setSelectedItemId(undefined);
    pushToast({ title: "Saved account deleted", description: `${account.accountName} was removed from this device.`, variant: "warning" });
  };

  return {
    view: shell.view,
    setView: shell.setView,
    selectedItemId: shell.selectedItemId,
    setSelectedItemId: shell.setSelectedItemId,
    query: shell.query,
    setQuery: shell.setQuery,
    kindFilter: shell.kindFilter,
    setKindFilter: shell.setKindFilter,
    compactMode: shell.compactMode,
    setCompactMode: shell.setCompactMode,
    toasts: toastController.toasts,
    accounts: shell.accounts,
    accountUsername: shell.accountUsername,
    inventoryRefreshActive,
    setInventoryRefreshActive,
    health,
    settings,
    inventory,
    steamInventory,
    tf2Inventory,
    dota2Inventory,
    armory,
    store,
    trades,
    receipts,
    events,
    connection,
    setConnection,
    pushToast,
    dismissToast,
    refreshInventoryState,
    refreshArmoryState,
    refreshStoreState,
    refreshTradesState,
    requestMarketPreview,
    saveSettings,
    addAccount,
    signInAccount,
    signOutAccount,
    deleteAccount,
    settleOperation: operationController.settleOperation,
    syncAccountState,
    operationApi: operationController.operationApi,
    refetchSettings,
    refetchInventory,
    refetchArmory,
    refetchStore,
    refetchOperations,
    refetchEvents,
    refetchConnection,
    refetchSteamInventory,
    refetchTF2Inventory,
    refetchDota2Inventory,
    props,
  };
}
