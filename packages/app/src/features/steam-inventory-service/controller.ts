import {
  createEffect,
  createResource,
  createSignal,
  type Accessor,
} from "solid-js";
import { errAsync } from "neverthrow";
import type { ConnectionStatus, SettingsData } from "@cs-inv-edit/contracts";
import type { AppScreen } from "../shell/view.js";
import type { LocalAgentClient } from "../../shared/lib/backend.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";

interface SteamInventoryServiceControllerOptions {
  backend: LocalAgentClient;
  settings: Accessor<SettingsData | undefined>;
  connection: Accessor<ConnectionStatus | undefined>;
  view: Accessor<AppScreen>;
  pushToast: (toast: {
    title: string;
    description?: string;
    variant?: import("../../shared/ui-types.js").StatusTone;
  }) => void;
}

export function createSteamInventoryServiceController(
  options: SteamInventoryServiceControllerOptions,
) {
  const [appId, setAppId] = createSignal<number>();
  const [games, { refetch: refetchGames }] = createResource(
    () =>
      options.view() === "steam-service-inventory" &&
      options.settings()?.featureFlags.enableSteamInventory &&
      options.connection()?.state === "connected"
        ? (options.connection()?.steamId ?? false)
        : false,
    (steamId) =>
      steamId
        ? options.backend.steamInventoryServiceGames().match(
            (snapshot) => snapshot,
            (error) => {
              console.error(error.message, error.cause);
              return undefined;
            },
          )
        : undefined,
  );
  createEffect(() => {
    if (options.connection()?.state !== "connected") {
      setAppId(undefined);
      return;
    }
    const available = games()?.games ?? [];
    if (available.length === 0) {
      setAppId(undefined);
      return;
    }
    if (!available.some((game) => game.appId === appId())) {
      setAppId(available[0]?.appId);
    }
  });
  const [inventory, { refetch }] = createResource(
    () =>
      options.settings()?.featureFlags.enableSteamInventory
        ? (appId() ?? false)
        : false,
    (requestedAppId) =>
      options.backend.steamInventoryService(requestedAppId).match(
        (snapshot) => snapshot,
        (error) => {
          console.error(error.message, error.cause);
          return undefined;
        },
      ),
  );
  let automaticRefresh = "";
  createEffect(() => {
    const steamId =
      options.connection()?.state === "connected"
        ? options.connection()?.steamId
        : undefined;
    const requestedAppId = appId();
    if (
      options.view() !== "steam-service-inventory" ||
      !steamId ||
      !requestedAppId ||
      !options.settings()?.featureFlags.enableSteamInventory
    ) {
      automaticRefresh = "";
      return;
    }
    const key = `${steamId}\u0000${requestedAppId}`;
    if (automaticRefresh === key) return;
    automaticRefresh = key;
    void options.backend
      .refreshSteamInventoryService(requestedAppId)
      .andThen((receipt) =>
        receipt.state === "failed" ||
        receipt.state === "requires_connection" ||
        receipt.state === "blocked_by_feature_flag"
          ? errAsync({
              message:
                receipt.message ?? "Steam Inventory Service refresh failed",
            })
          : fromAppPromise(
              Promise.resolve(refetch()),
              "Steam Inventory Service reload failed",
            ),
      )
      .match(
        () => undefined,
        (error) => {
          automaticRefresh = "";
          void refetch();
          options.pushToast({
            title: "Inventory Service refresh failed",
            description: appErrorMessage(
              error,
              `Unable to refresh AppID ${requestedAppId}`,
            ),
            variant: "danger",
          });
        },
      );
  });
  return { appId, setAppId, games, refetchGames, inventory, refetch };
}
