import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ArmorySnapshot, StoreSnapshot } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import { writeStoredJson } from "../../shared/lib/storage.js";
import { enabledModeOrDefault } from "./view.js";
import {
  createArmoryRefresher,
  createInventoryRefresher,
} from "../../shared/lib/loading-refresh.js";
import { createShellController } from "./controller.js";
import { createToastController } from "../notifications/controller.js";
import { createSteamInventoryServiceController } from "../steam-inventory-service/controller.js";
import type { AppProps } from "./app-props.js";

import {
  accountStorageKey,
  loadSteamAccounts,
  modeFromUrl,
  screenFromUrl,
  writeLoginToUrl,
} from "./app-controller-url.js";
import { createAppResources } from "./app-resources.js";
import { createAccountController } from "../accounts/account-controller.js";
import { createCommerceRefreshers } from "../commerce/commerce-refreshers.js";
import { shouldShowAccountScreen } from "../accounts/account-route.js";
import {
  installAutomaticGameInventoryRefresh,
  installConnectedAccountSync,
  installShellNavigationSync,
} from "./app-controller-effects.js";
import { createMarketPreviewRequester } from "./app-market-preview.js";
export function createAppController(props: AppProps) {
  const shell = createShellController(screenFromUrl());
  shell.setAccounts(loadSteamAccounts());
  const toastController = createToastController();
  const [inventoryRefreshActive, setInventoryRefreshActive] =
    createSignal(false);

  const {
    health,
    settings,
    refetchSettings,
    tf2ProtocolEntries,
    inventory,
    refetchInventory,
    steamInventory,
    refetchSteamInventory,
    tf2Inventory,
    refetchTF2Inventory,
    tf2Features,
    refetchTF2Features,
    cs2Features,
    dota2Inventory,
    refetchDota2Inventory,
    armory,
    refetchArmory,
    setArmory,
    store,
    refetchStore,
    setStore,
    tf2Store,
    refetchTF2Store,
    setTF2Store,
    trades,
    setTrades,
    tradeAccounts,
    setTradeAccounts,
    receipts,
    refetchOperations,
    events,
    refetchEvents,
    connection,
    refetchConnection,
    setConnection,
  } = createAppResources(props);
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
  const requestMarketPreview = createMarketPreviewRequester(props.backend);

  installShellNavigationSync({ shell, connection, settings });

  installAutomaticGameInventoryRefresh({
    backend: props.backend,
    shell,
    connection,
    settings,
    refetch: {
      steam: refetchSteamInventory,
      tf2: refetchTF2Inventory,
      dota2: refetchDota2Inventory,
    },
    pushToast,
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
    });
  const refreshTF2StoreState = async () => {
    setTF2Store((current) => ({
      status: "loading",
      offers: current?.offers ?? [],
      refreshedAt: current?.refreshedAt ?? new Date().toISOString(),
      priceSheetVersion: current?.priceSheetVersion,
      currency: current?.currency,
      message: "Requesting the current TF2 GC price sheet",
    }));
    await props.backend
      .refreshTF2Store()
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(refetchTF2Store()),
          "TF2 Store reload failed",
        ),
      )
      .match(
        () => undefined,
        (error) =>
          setTF2Store((current): StoreSnapshot => ({
            status: "error",
            offers: current?.offers ?? [],
            refreshedAt: new Date().toISOString(),
            message: appErrorMessage(error, "Unable to refresh TF2 Store"),
          })),
      );
  };
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
  let automaticTF2StoreRefresh = "";
  createEffect(() => {
    const steamId =
      connection()?.state === "connected" ? connection()?.steamId : undefined;
    const enabled = settings()?.featureFlags.enableTf2Store !== false;
    if (
      shell.view() !== "tf2-store" ||
      !steamId ||
      !enabled ||
      tf2Store()?.status === "ready"
    )
      return;
    const key = `${steamId}\u0000tf2-store\u0000${enabled}`;
    if (automaticTF2StoreRefresh === key) return;
    automaticTF2StoreRefresh = key;
    void refreshTF2StoreState();
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
    writeStoredJson(accountStorageKey, shell.accounts()).match(
      () => undefined,
      (error) => console.warn(error.message, error.cause),
    );
  });

  installConnectedAccountSync(shell, connection);

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

  createEffect(() => {
    const currentView = shell.view();
    if (currentView === "account") return;
    if (
      !shouldShowAccountScreen({
        currentView,
        connection: connection(),
        connectionLoading: connection.loading,
        hasSignedInAccount: shell
          .accounts()
          .some((account) => account.signedIn),
      })
    )
      return;

    writeLoginToUrl(currentView).match(
      () => undefined,
      (error) => console.warn("[app] login URL could not be updated", error),
    );
    shell.setView("account");
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

  const {
    syncAccountState,
    operationController,
    saveSettings,
    addAccount,
    signInAccount,
    signOutAccount,
    deleteAccount,
  } = createAccountController({
    props,
    shell,
    settings,
    pushToast,
    refreshInventoryState,
    refreshArmoryState,
    refetchConnection,
    refetchInventory,
    refetchOperations,
    refetchEvents,
    refetchSettings,
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
    accountLoginOnly: shell.accountLoginOnly,
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
    tf2Store,
    trades,
    tradeAccounts,
    receipts,
    events,
    connection,
    setConnection,
    pushToast,
    dismissToast: toastController.dismissToast,
    refreshInventoryState,
    refreshArmoryState,
    refreshStoreState,
    refreshTF2StoreState,
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
    refetchTF2Store,
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
