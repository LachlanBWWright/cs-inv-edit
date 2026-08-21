import { createEffect, type Accessor } from "solid-js";
import { errAsync } from "neverthrow";
import type {
  ConnectionStatus,
  GameInventorySnapshot,
  SettingsData,
  SteamAccountProfile,
} from "@cs-inv-edit/contracts";
import type { LocalAgentClient } from "../../shared/lib/backend.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import type { createShellController } from "./controller.js";
import { enabledModeOrDefault } from "./view.js";
import { writeModeToUrl } from "./app-controller-url.js";
import { logSteamDiagnostics } from "./app-market-preview.js";

type ShellController = ReturnType<typeof createShellController>;
type Game = import("../../shared/ui-types.js").EconomyGame;

export function installShellNavigationSync(input: {
  shell: ShellController;
  connection: Accessor<ConnectionStatus | undefined>;
  settings: Accessor<SettingsData | undefined>;
}) {
  createEffect(() => logSteamDiagnostics("status", input.connection()));

  createEffect(() => {
    const currentSettings = input.settings();
    if (!currentSettings) return;
    const current = input.shell.view();
    if (
      current !== "account" &&
      enabledModeOrDefault(current, currentSettings.featureFlags) !== current
    ) {
      input.shell.setSelectedItemId(undefined);
      input.shell.setView("inventory");
    }
  });

  createEffect(() => {
    const current = input.shell.view();
    if (current === "account") return;
    writeModeToUrl(current).match(
      () => undefined,
      (error) =>
        console.warn("[app] selected mode URL could not be updated", error),
    );
  });

  let selectionScope = "";
  createEffect(() => {
    const nextScope = `${input.connection()?.steamId ?? "disconnected"}\u0000${input.shell.view()}`;
    if (selectionScope && selectionScope !== nextScope)
      input.shell.setSelectedItemId(undefined);
    selectionScope = nextScope;
  });
}

export function installAutomaticGameInventoryRefresh(input: {
  backend: LocalAgentClient;
  shell: ShellController;
  connection: Accessor<ConnectionStatus | undefined>;
  settings: Accessor<SettingsData | undefined>;
  refetch: Record<
    Game,
    () =>
      | GameInventorySnapshot
      | Promise<GameInventorySnapshot | undefined>
      | null
      | undefined
  >;
  pushToast: (toast: {
    title: string;
    description: string;
    variant: "danger";
  }) => void;
}) {
  let automaticRefresh = "";
  createEffect(() => {
    const view = input.shell.view();
    const game: Game | undefined =
      view === "steam-inventory"
        ? "steam"
        : view === "tf2-inventory"
          ? "tf2"
          : view === "dota2-inventory"
            ? "dota2"
            : undefined;
    const steamId =
      input.connection()?.state === "connected"
        ? input.connection()?.steamId
        : undefined;
    if (!game || !steamId) {
      automaticRefresh = "";
      return;
    }
    const flags = input.settings()?.featureFlags;
    const enabled =
      game === "steam"
        ? flags?.enableSteamInventory
        : game === "tf2"
          ? flags?.enableTf2Inventory
          : flags?.enableDota2Inventory;
    const key = `${steamId}\u0000${game}`;
    if (!enabled || automaticRefresh === key) return;
    automaticRefresh = key;
    void input.backend
      .refreshGameInventory(game)
      .andThen((receipt) =>
        receipt.state === "failed" ||
        receipt.state === "requires_connection" ||
        receipt.state === "blocked_by_feature_flag"
          ? errAsync({
              message: receipt.message ?? `${game} inventory refresh failed`,
            })
          : fromAppPromise(
              Promise.resolve(input.refetch[game]()),
              `${game} inventory reload failed`,
            ),
      )
      .match(
        () => undefined,
        (error) => {
          automaticRefresh = "";
          void input.refetch[game]();
          input.pushToast({
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
}

export function installConnectedAccountSync(
  shell: ShellController,
  connection: Accessor<ConnectionStatus | undefined>,
) {
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
}
