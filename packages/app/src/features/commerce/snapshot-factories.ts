import type { SteamTradesSnapshot, StoreSnapshot } from "@cs-inv-edit/contracts";

export function loadingStoreSnapshot(
  current: StoreSnapshot | undefined,
  message: string,
): StoreSnapshot {
  return {
    status: "loading",
    offers: current?.offers ?? [],
    refreshedAt: current?.refreshedAt ?? new Date().toISOString(),
    priceSheetVersion: current?.priceSheetVersion,
    currency: current?.currency,
    message,
  };
}

export function errorStoreSnapshot(
  current: StoreSnapshot | undefined,
  message: string,
): StoreSnapshot {
  return {
    status: "error",
    offers: current?.offers ?? [],
    refreshedAt: new Date().toISOString(),
    priceSheetVersion: current?.priceSheetVersion,
    currency: current?.currency,
    message,
  };
}

export function loadingTradesSnapshot(
  current: SteamTradesSnapshot | undefined,
): SteamTradesSnapshot {
  return {
    status: "loading",
    received: current?.received ?? [],
    sent: current?.sent ?? [],
    history: current?.history ?? [],
    refreshedAt: current?.refreshedAt ?? new Date().toISOString(),
    message: "Loading Steam trades",
  };
}

export function errorTradesSnapshot(
  current: SteamTradesSnapshot | undefined,
  message: string,
): SteamTradesSnapshot {
  return {
    status: "error",
    received: current?.received ?? [],
    sent: current?.sent ?? [],
    history: current?.history ?? [],
    refreshedAt: new Date().toISOString(),
    message,
  };
}
