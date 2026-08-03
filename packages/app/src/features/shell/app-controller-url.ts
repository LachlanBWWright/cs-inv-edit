import { fromThrowable } from "neverthrow";
import { steamAccountProfilesSchema, type SteamAccountProfile } from "@cs-inv-edit/contracts";
import type { AppMode, AppScreen } from "./view.js";
import { isAppMode } from "./view.js";

export const accountStorageKey = "cs-inv-edit.steam-accounts.v1";

export const writeModeToUrl = fromThrowable(
  (mode: AppMode) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", mode);
    url.searchParams.delete("returnTo");
    window.history.replaceState(window.history.state, "", url);
  },
  (cause) => ({ message: "Unable to update the selected mode URL", cause }),
);

export const writeLoginToUrl = fromThrowable(
  (returnTo: AppMode) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "account");
    url.searchParams.set("returnTo", returnTo);
    window.history.replaceState(window.history.state, "", url);
  },
  (cause) => ({ message: "Unable to update the login URL", cause }),
);

export function modeFromUrl(): AppMode {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view");
  if (isAppMode(requestedView)) return requestedView;
  const returnTo = params.get("returnTo");
  return isAppMode(returnTo) ? returnTo : "inventory";
}

export function screenFromUrl(): AppScreen {
  return new URLSearchParams(window.location.search).get("view") === "account"
    ? "account"
    : modeFromUrl();
}

const readSteamAccounts = fromThrowable(
  () => {
    const parsed = steamAccountProfilesSchema.safeParse(
      JSON.parse(window.localStorage.getItem(accountStorageKey) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  },
  () => [] as SteamAccountProfile[],
);

export function loadSteamAccounts(): SteamAccountProfile[] {
  return readSteamAccounts().match(
    (accounts) => accounts,
    (fallback) => fallback,
  );
}
