import type { AppBackendClient } from "./backend.js";
import { appErrorMessage, fromAppPromise } from "./result.js";
import type { StatusTone } from "../ui-types.js";

type Toast = {
  title: string;
  description?: string;
  variant?: StatusTone;
};

function pollLoadingSnapshot(refetch: () => unknown, label: string) {
  return window.setInterval(() => {
    void fromAppPromise(
      Promise.resolve(refetch()),
      `${label} progress refresh failed`,
    ).match(
      () => undefined,
      () => undefined,
    );
  }, 1000);
}

export function createInventoryRefresher(input: {
  backend: AppBackendClient;
  refetch: () => unknown;
  setActive: (active: boolean) => void;
  pushToast: (toast: Toast) => void;
}) {
  let inFlight: Promise<boolean> | undefined;
  return (options?: { suppressToast?: boolean }): Promise<boolean> => {
    if (inFlight) return inFlight;
    input.setActive(true);
    const progressPoll = pollLoadingSnapshot(input.refetch, "Inventory");
    inFlight = input.backend
      .refreshInventory()
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(input.refetch()),
          "Inventory reload failed",
        ),
      )
      .match(
        () => false,
        (error) => {
          console.error("[app] inventory refresh failed", error);
          if (!options?.suppressToast)
            input.pushToast({
              title: "Inventory refresh failed",
              description: appErrorMessage(error, "Unable to refresh inventory"),
              variant: "danger",
            });
          return true;
        },
      )
      .finally(() => {
        window.clearInterval(progressPoll);
        inFlight = undefined;
        input.setActive(false);
      });
    return inFlight;
  };
}

export function createArmoryRefresher(input: {
  backend: AppBackendClient;
  refetch: () => unknown;
  markLoading: () => void;
  pushToast: (toast: Toast) => void;
}) {
  let inFlight: Promise<void> | undefined;
  return (): Promise<void> => {
    if (inFlight) return inFlight;
    input.markLoading();
    const progressPoll = pollLoadingSnapshot(input.refetch, "Armory");
    inFlight = input.backend
      .refreshArmory()
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(input.refetch()),
          "Armory reload failed",
        ),
      )
      .match(
        () => undefined,
        (error) =>
          input.pushToast({
            title: "Armory refresh failed",
            description: appErrorMessage(error, "Unable to refresh Armory"),
            variant: "danger",
          }),
      )
      .finally(() => {
        window.clearInterval(progressPoll);
        inFlight = undefined;
      });
    return inFlight;
  };
}
