import type { ConnectionStatus } from "@cs-inv-edit/contracts";
import type { AppScreen } from "../shell/view.js";

interface AccountRouteState {
  currentView: AppScreen;
  connection: ConnectionStatus | undefined;
  connectionLoading: boolean;
  hasSignedInAccount: boolean;
}

export function shouldShowAccountScreen(state: AccountRouteState): boolean {
  if (state.currentView === "account") return false;
  if (state.connection?.state === "connected") return false;
  if (
    state.hasSignedInAccount &&
    (state.connectionLoading || state.connection?.state === "connecting")
  )
    return false;

  return true;
}
