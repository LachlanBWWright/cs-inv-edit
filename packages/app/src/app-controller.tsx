import { createEffect, createSignal, onCleanup } from "solid-js";
import { errAsync } from "neverthrow";
import type { ArmorySnapshot, ConnectionStatus, RelatedItemDto, SteamAccountProfile } from "@cs-inv-edit/contracts";
import type { LocalAgentClient } from "./lib/backend.js";
import type { SharedDataClient } from "./lib/shared-data.js";
import { appErrorMessage, fromAppPromise } from "./lib/result.js";
import { enabledModeOrDefault } from "./view.js";
import {
  createArmoryRefresher,
  createInventoryRefresher,
} from "./lib/loading-refresh.js";
import { createShellController } from "./features/shell/controller.js";
import { createToastController } from "./features/notifications/controller.js";
import { createSteamInventoryServiceController } from "./features/steam-inventory-service/controller.js";

export interface AppProps {
  backend: LocalAgentClient;
  data: SharedDataClient;
  platform: "desktop" | "web";
}

import { accountStorageKey, loadSteamAccounts, modeFromUrl, screenFromUrl, writeLoginToUrl, writeModeToUrl } from "./app-controller-url.js";
import { createAppResources } from "./app-resources.js";
import { createAccountController } from "./account-controller.js";
import { createCommerceRefreshers } from "./commerce-refreshers.js";

export function createAppController(props: AppProps) {
  const shell = createShellController(screenFromUrl());
  shell.setAccounts(loadSteamAccounts());
  const toastController = createToastController();
  const [inventoryRefreshActive, setInventoryRefreshActive] =
    createSignal(false);

  const { health, settings, refetchSettings, tf2ProtocolEntries, inventory, refetchInventory, steamInventory, refetchSteamInventory, tf2Inventory, refetchTF2Inventory, tf2Features, refetchTF2Features, cs2Features, dota2Inventory, refetchDota2Inventory, armory, refetchArmory, setArmory, store, refetchStore, setStore, trades, setTrades, tradeAccounts, setTradeAccounts, receipts, refetchOperations, events, refetchEvents, connection, refetchConnection, setConnection } = createAppResources(props);
  const pushToast = toastController.pushToast;

  const refreshInventoryState = createInventoryRefresher({
    backend: props.backend,
    refetch: refetchInventory,
    setActive: setInventoryRefreshActive,
    pushToast,
  });
  const refreshArmoryState = createArmoryRefresher({
    backend: props.backend,
    refetch: refetchArmory,
    pushToast,
    markLoading: () =>
      setArmory((current): ArmorySnapshot => ({
        balance: current?.balance ?? 0,
        generationTime: current?.generationTime ?? 0,
        itemIds: current?.itemIds ?? [],
        offers: current?.offers ?? [],
        refreshedAt: current?.refreshedAt ?? new Date().toISOString(),
        status: "loading",
        diagnostics: current?.diagnostics,
      })),
  });
  const marketPreviewCache = new Map<
    string,
    Promise<RelatedItemDto | undefined>
  >();
  const requestMarketPreview = (marketName: string) => {
    const cached = marketPreviewCache.get(marketName);
    if (cached) return cached;
    const request = props.backend
      .marketPreview(marketName)
      .match(
        (preview) => preview,
        () => undefined,
      )
      .then((preview) => {
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
    if (
      current !== "account" &&
      enabledModeOrDefault(current, flags) !== current
    ) {
      shell.setSelectedItemId(undefined);
      shell.setView("inventory");
    }
  });

  createEffect(() => {
    const current = shell.view();
    if (current === "account") return;
    writeModeToUrl(current).match(
      () => undefined,
      (error) =>
        console.warn("[app] selected mode URL could not be updated", error),
    );
  });

  let selectionScope = "";
  createEffect(() => {
    const nextScope = `${connection()?.steamId ?? "disconnected"}\u0000${shell.view()}`;
    if (selectionScope && selectionScope !== nextScope)
      shell.setSelectedItemId(undefined);
    selectionScope = nextScope;
  });

  let automaticGameRefresh = "";
  createEffect(() => {
    const game =
      shell.view() === "steam-inventory"
        ? "steam"
        : shell.view() === "tf2-inventory"
          ? "tf2"
          : shell.view() === "dota2-inventory"
            ? "dota2"
            : undefined;
    const steamId =
      connection()?.state === "connected" ? connection()?.steamId : undefined;
    if (!game || !steamId) {
      automaticGameRefresh = "";
      return;
    }
    const enabled =
      game === "steam"
        ? settings()?.featureFlags.enableSteamInventory
        : game === "tf2"
          ? settings()?.featureFlags.enableTf2Inventory
          : settings()?.featureFlags.enableDota2Inventory;
    const refetchGame = () =>
      game === "steam"
        ? refetchSteamInventory()
        : game === "tf2"
          ? refetchTF2Inventory()
          : refetchDota2Inventory();
    const key = `${steamId}\u0000${game}`;
    if (!enabled || automaticGameRefresh === key) return;
    automaticGameRefresh = key;
    void props.backend
      .refreshGameInventory(game)
      .andThen((receipt) =>
        receipt.state === "failed" ||
        receipt.state === "requires_connection" ||
        receipt.state === "blocked_by_feature_flag"
          ? errAsync({
              message: receipt.message ?? `${game} inventory refresh failed`,
            })
          : fromAppPromise(
              Promise.resolve(refetchGame()),
              `${game} inventory reload failed`,
            ),
      )
      .match(
        () => undefined,
        (error) => {
          automaticGameRefresh = "";
          void refetchGame();
          pushToast({
            title: "Inventory refresh failed",
            description: appErrorMessage(
              error,
              `Unable to refresh ${game} inventory`,
            ),
            variant: "danger",
          });
        },
      );
  });

  const steamService = createSteamInventoryServiceController({
    backend: props.backend,
    settings,
    connection,
    view: shell.view,
    pushToast,
  });

  let automaticArmoryRefresh = "";
  createEffect(() => {
    const steamId =
      connection()?.state === "connected" ? connection()?.steamId : undefined;
    if (shell.view() !== "armory" || !steamId || armory()?.status === "ready")
      return;
    const key = `${steamId}\u0000armory`;
    if (automaticArmoryRefresh === key) return;
    automaticArmoryRefresh = key;
    void refreshArmoryState();
  });
  let automaticStoreRefresh = "";
  const { refreshStoreState, refreshTradesState, refreshTradeAccountsState } =
    createCommerceRefreshers({
      props,
      setStore,
      setTrades,
      setTradeAccounts,
      refetchStore,
      pushToast,
    });
  createEffect(() => {
    const steamId =
      connection()?.state === "connected" ? connection()?.steamId : undefined;
    const enabled = settings()?.featureFlags.enableStoreRead === true;
    if (
      shell.view() !== "store" ||
      !steamId ||
      !enabled ||
      store()?.status === "ready"
    )
      return;
    const key = `${steamId}\u0000store\u0000${enabled}`;
    if (automaticStoreRefresh === key) return;
    automaticStoreRefresh = key;
    void refreshStoreState();
  });
  let automaticTradeRefresh = "";
  createEffect(() => {
    const steamId =
      connection()?.state === "connected" ? connection()?.steamId : undefined;
    if (shell.view() !== "trades" || !steamId) return;
    const key = `${steamId}\u0000trades`;
    if (automaticTradeRefresh === key) return;
    automaticTradeRefresh = key;
    void refreshTradeAccountsState();
  });

  createEffect(() => {
    const snapshot = armory();
    if (snapshot) console.info("[armory] validated snapshot", snapshot);
  });

  createEffect(() => {
    window.localStorage.setItem(
      accountStorageKey,
      JSON.stringify(shell.accounts()),
    );
  });

  createEffect(() => {
    const status = connection();
    if (!status) return;
    if (status.state !== "connected" || !status.accountName) {
      shell.setAccounts((current) =>
        current.map((account) => ({ ...account, signedIn: false })),
      );
      return;
    }
    shell.setAccounts((current) => {
      const next = current.map((account) => ({ ...account, signedIn: false }));
      const index = next.findIndex(
        (account) =>
          account.accountName.toLowerCase() ===
          status.accountName!.toLowerCase(),
      );
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
      shell.setView(
        enabledModeOrDefault(modeFromUrl(), settings()?.featureFlags),
      );
      void syncAccountState(status);
    }
  });
  onCleanup(() => stopSteamStatus?.());

  const dismissToast = toastController.dismissToast;

  createEffect(() => {
    const currentView = shell.view();
    if (
      connection() &&
      connection()?.state !== "connected" &&
      currentView !== "account"
    ) {
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
    void props.backend
      .submitOperation("settings", {
        ...currentSettings,
        featureFlags: { ...currentSettings.featureFlags, enableNameTags: true },
      })
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(refetchSettings()),
          "Failed to refresh settings",
        ),
      )
      .match(
        () => undefined,
        (error) => {
          console.error("[app] failed to enable name-tag workflow", error);
          pushToast({
            title: "Defaults updated",
            description: "Name-tag editing could not be enabled automatically.",
            variant: "warning",
          });
        },
      );
  });

  const { syncAccountState, operationController,
    saveSettings, addAccount, signInAccount, signOutAccount, deleteAccount,
  } = createAccountController({ props, shell, settings, pushToast,
    refreshInventoryState, refreshArmoryState, refetchConnection,
    refetchInventory, refetchOperations, refetchEvents, refetchSettings,
  });
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
    steamServiceInventory: steamService.inventory,
    steamServiceGames: steamService.games,
    steamServiceGamesLoading: () => steamService.games.loading,
    steamServiceAppId: steamService.appId,
    setSteamServiceAppId: steamService.setAppId,
    tf2Inventory,
    tf2Features,
    cs2Features,
    tf2ProtocolEntries,
    dota2Inventory,
    armory,
    store,
    trades,
    tradeAccounts,
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
    refreshTradeAccountsState,
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
    refetchTF2Features,
    refetchArmory,
    refetchStore,
    refetchOperations,
    refetchEvents,
    refetchConnection,
    refetchSteamInventory,
    refetchSteamServiceInventory: steamService.refetch,
    refetchTF2Inventory,
    refetchDota2Inventory,
    props,
  };
}
