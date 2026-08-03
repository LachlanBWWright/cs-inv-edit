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

  // A persisted signed-in account may still be restored by the local agent.
  // Keep the requested screen in place only while that first status request is
  // genuinely pending. Once it settles without a connection, sign-in is the
  // only useful screen.
  return !(state.connectionLoading && state.hasSignedInAccount);
}
