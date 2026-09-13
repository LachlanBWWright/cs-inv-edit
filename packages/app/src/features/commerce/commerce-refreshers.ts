import { createEffect, type Accessor, type Setter } from "solid-js";
import type {
  SteamAccountTradesCollection,
  SteamTradesSnapshot,
  StoreSnapshot,
} from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import type { AppProps } from "../shell/app-props.js";
import type { ConnectionStatus, SettingsData } from "@cs-inv-edit/contracts";
import type { AppScreen } from "../shell/view.js";
import {
  errorStoreSnapshot,
  errorTradesSnapshot,
  loadingStoreSnapshot,
  loadingTradesSnapshot,
} from "./snapshot-factories.js";
import { connectedSteamId } from "../../shared/lib/steam-connection.js";

type ResourceRefetch = (info?: unknown) => unknown;

export function createCommerceRefreshers(context: {
  props: AppProps;
  setStore: Setter<StoreSnapshot | undefined>;
  setTrades: Setter<SteamTradesSnapshot | undefined>;
  setTradeAccounts: Setter<SteamAccountTradesCollection | undefined>;
  refetchStore: ResourceRefetch;
}) {
  const { props, setStore, setTrades, setTradeAccounts, refetchStore } =
    context;
  const refreshStoreState = async () => {
    setStore((current) =>
      loadingStoreSnapshot(current, "Requesting the current GC price sheet"),
    );
    await props.backend
      .refreshStore()
      .andThen(() =>
        fromAppPromise(Promise.resolve(refetchStore()), "Store reload failed"),
      )
      .match(
        () => undefined,
        (error) => {
          const message = appErrorMessage(error, "Unable to refresh store");
          setStore((current) => errorStoreSnapshot(current, message));
        },
      );
  };
  const refreshTradesState = async () => {
    setTrades(loadingTradesSnapshot);
    await props.backend.refreshTrades().match(
      (snapshot) => setTrades(snapshot),
      (error) =>
        setTrades((current) =>
          errorTradesSnapshot(current, appErrorMessage(error, "Unable to load trades")),
        ),
    );
  };
  const refreshTradeAccountsState = async (steamId?: string) => {
    await props.backend.refreshTradeAccounts(steamId).match(
      (collection) => setTradeAccounts(collection),
      (_error) =>
        setTradeAccounts((current): SteamAccountTradesCollection => ({
          accounts: current?.accounts ?? [],
          refreshedAt: new Date().toISOString(),
        })),
    );
  };
  return { refreshStoreState, refreshTradesState, refreshTradeAccountsState };
}

export function installAutomaticCommerceRefresh(input: {
  props: AppProps;
  view: Accessor<AppScreen>;
  connection: Accessor<ConnectionStatus | undefined>;
  settings: Accessor<SettingsData | undefined>;
  setTF2Store: Setter<StoreSnapshot | undefined>;
  refetchTF2Store: (info?: unknown) => unknown;
  refreshStoreState: () => Promise<void>;
  refreshTradeAccountsState: () => Promise<void>;
}) {
  const refreshTF2StoreState = async () => {
    input.setTF2Store((current) =>
      loadingStoreSnapshot(current, "Requesting the current TF2 GC price sheet"),
    );
    await input.props.backend
      .refreshTF2Store()
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(input.refetchTF2Store()),
          "TF2 Store reload failed",
        ),
      )
      .match(
        () => undefined,
        (error) =>
          input.setTF2Store((current) =>
            errorStoreSnapshot(current, appErrorMessage(error, "Unable to refresh TF2 Store")),
          ),
      );
  };

  let storeKey = "";
  let tf2StoreKey = "";
  let tradeKey = "";
  createEffect(() => {
    const steamId = connectedSteamId(input.connection());
    const view = input.view();
    const storeEnabled = input.settings()?.featureFlags.enableStoreRead === true;
    if (view === "store" && steamId && storeEnabled) {
      const key = `${steamId}\u0000store\u0000${storeEnabled}`;
      if (storeKey !== key) {
        storeKey = key;
        void input.refreshStoreState();
      }
    }
    const tf2Enabled = input.settings()?.featureFlags.enableTf2Store !== false;
    if (view === "tf2-store" && steamId && tf2Enabled) {
      const key = `${steamId}\u0000tf2-store\u0000${tf2Enabled}`;
      if (tf2StoreKey !== key) {
        tf2StoreKey = key;
        void refreshTF2StoreState();
      }
    }
    if (view === "trades" && steamId) {
      const key = `${steamId}\u0000trades`;
      if (tradeKey !== key) {
        tradeKey = key;
        void input.refreshTradeAccountsState();
      }
    }
    if (!steamId) {
      storeKey = "";
      tf2StoreKey = "";
      tradeKey = "";
    }
  });
  return { refreshTF2StoreState };
}
