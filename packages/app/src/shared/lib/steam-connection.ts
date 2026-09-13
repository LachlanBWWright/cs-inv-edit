import type { ConnectionStatus } from "@cs-inv-edit/contracts";

export function connectedSteamId(status?: ConnectionStatus) {
  return status?.state === "connected" ? status.steamId : undefined;
}
