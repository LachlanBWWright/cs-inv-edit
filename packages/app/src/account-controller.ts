import type { Accessor } from "solid-js";
import type { ConnectionStatus, SettingsData, SteamAccountProfile } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "./lib/result.js";
import { enabledModeOrDefault } from "./view.js";
import { modeFromUrl } from "./app-controller-url.js";
import { createOperationsController } from "./features/operations/controller.js";
import type { createShellController } from "./features/shell/controller.js";
import type { createToastController } from "./features/notifications/controller.js";
import type { AppProps } from "./app-controller.js";

interface AccountControllerContext {
  props: AppProps;
  shell: ReturnType<typeof createShellController>;
  settings: Accessor<SettingsData | undefined>;
  pushToast: ReturnType<typeof createToastController>["pushToast"];
  refreshInventoryState: () => Promise<boolean>;
  refreshArmoryState: () => Promise<unknown>;
  refetchConnection: ResourceRefetch<ConnectionStatus>;
  refetchInventory: ResourceRefetch<unknown>;
  refetchOperations: ResourceRefetch<unknown>;
  refetchEvents: ResourceRefetch<unknown>;
  refetchSettings: ResourceRefetch<unknown>;
}

type ResourceRefetch<T> = (
  info?: unknown,
) => T | Promise<T | undefined> | null | undefined;

export function createAccountController(context: AccountControllerContext) {
  const { props, shell, settings, pushToast, refreshInventoryState, refreshArmoryState, refetchConnection, refetchInventory, refetchOperations, refetchEvents, refetchSettings } = context;
  const syncAccountState = async (latestStatus?: ConnectionStatus) => {
    console.info("[app] syncing account state");
    const refreshedStatus = await refetchConnection();
    const status = latestStatus ?? refreshedStatus;
    if (status?.state === "connected") {
      shell.setView(
        enabledModeOrDefault(modeFromUrl(), settings()?.featureFlags),
      );
      console.info("[app] connection ready, refreshing inventory");
      const inventoryRefreshFailed = await refreshInventoryState();
      if (!inventoryRefreshFailed) {
        await refreshArmoryState();
      }
      pushToast({
        title: "Account connected",
        description: inventoryRefreshFailed
          ? "Signed in successfully. Inventory still needs attention."
          : "Inventory is ready to inspect and edit.",
        variant: "success",
      });
      return;
    }
    shell.setView("account");
  };

  const operationController = createOperationsController({
    backend: props.backend,
    refreshInventory: () =>
      props.backend
        .refreshInventory()
        .andThen(() =>
          fromAppPromise(
            Promise.resolve(refetchInventory()),
            "Inventory reload failed",
          ),
        ),
    refetchOperations: () => refetchOperations(),
    refetchEvents: () => refetchEvents(),
  });

  const disconnectAndRefresh = async () => {
    if (!props.backend.disconnectSteam) return;
    return props.backend
      .disconnectSteam()
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(refetchConnection()),
          "Connection reload failed",
        ),
      )
      .match(
        () => undefined,
        (error) =>
          pushToast({
            title: "Disconnect failed",
            description: appErrorMessage(error, "Unable to disconnect"),
            variant: "danger",
          }),
      );
  };

  const saveSettings = async (next: SettingsData) => {
    console.info("[app] saving settings", next);
    return props.backend
      .submitOperation("settings", next)
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(refetchSettings()),
          "Settings reload failed",
        ),
      )
      .match(
        () => ({ ok: true as const, message: "Settings updated" }),
        (error) => ({
          ok: false as const,
          message: appErrorMessage(error, "Unable to save settings"),
        }),
      );
  };

  const addAccount = async () => {
    shell.setSelectedItemId(undefined);
    shell.setAccountUsername("");
    shell.setView("account");
  };

  const signInAccount = async (account: SteamAccountProfile) => {
    shell.setSelectedItemId(undefined);
    shell.setAccountUsername(account.accountName);
    shell.setView("account");
  };

  const signOutAccount = async (account: SteamAccountProfile) => {
    if (account.signedIn && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    shell.setAccounts((current) =>
      current.map((candidate) =>
        candidate.accountName === account.accountName
          ? { ...candidate, signedIn: false }
          : candidate,
      ),
    );
    shell.setSelectedItemId(undefined);
    pushToast({
      title: "Account signed out",
      description: account.accountName,
      variant: "warning",
    });
  };

  const deleteAccount = async (account: SteamAccountProfile) => {
    if (account.signedIn && props.backend.disconnectSteam) {
      await disconnectAndRefresh();
    }
    shell.setAccounts((current) =>
      current.filter(
        (candidate) => candidate.accountName !== account.accountName,
      ),
    );
    shell.setSelectedItemId(undefined);
    pushToast({
      title: "Saved account deleted",
      description: `${account.accountName} was removed from this device.`,
      variant: "warning",
    });
  };

  return { syncAccountState, operationController, disconnectAndRefresh, saveSettings, addAccount, signInAccount, signOutAccount, deleteAccount };
}
