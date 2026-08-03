import type { Setter } from "solid-js";
import type { SteamAccountTradesCollection, SteamTradesSnapshot, StoreSnapshot } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import type { AppProps } from "../shell/app-controller.js";

type ResourceRefetch = (info?: unknown) => unknown;

export function createCommerceRefreshers(context: {
  props: AppProps;
  setStore: Setter<StoreSnapshot | undefined>;
  setTrades: Setter<SteamTradesSnapshot | undefined>;
  setTradeAccounts: Setter<SteamAccountTradesCollection | undefined>;
  refetchStore: ResourceRefetch;
}) {
  const { props, setStore, setTrades, setTradeAccounts, refetchStore } = context;
  const refreshStoreState = async () => {
    setStore((current): StoreSnapshot => ({
      status: "loading",
      offers: current?.offers ?? [],
      refreshedAt: current?.refreshedAt ?? new Date().toISOString(),
      priceSheetVersion: current?.priceSheetVersion,
      currency: current?.currency,
      message: "Requesting the current GC price sheet",
    }));
    await props.backend
      .refreshStore()
      .andThen(() =>
        fromAppPromise(Promise.resolve(refetchStore()), "Store reload failed"),
      )
      .match(
        () => undefined,
        (error) => {
          const message = appErrorMessage(error, "Unable to refresh store");
          setStore((current): StoreSnapshot => ({
            status: "error",
            offers: current?.offers ?? [],
            refreshedAt: new Date().toISOString(),
            priceSheetVersion: current?.priceSheetVersion,
            currency: current?.currency,
            message,
          }));
        },
      );
  };
  const refreshTradesState = async () => {
    setTrades((current): SteamTradesSnapshot => ({
      status: "loading",
      received: current?.received ?? [],
      sent: current?.sent ?? [],
      history: current?.history ?? [],
      refreshedAt: current?.refreshedAt ?? new Date().toISOString(),
      message: "Loading Steam trades",
    }));
    await props.backend.refreshTrades().match(
      (snapshot) => setTrades(snapshot),
      (error) =>
        setTrades((current): SteamTradesSnapshot => ({
          status: "error",
          received: current?.received ?? [],
          sent: current?.sent ?? [],
          history: current?.history ?? [],
          refreshedAt: new Date().toISOString(),
          message: appErrorMessage(error, "Unable to load trades"),
        })),
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
