export { App, type AppProps } from "./features/shell/app-view.js";
export type { AppBackendClient, LocalAgentClient } from "./shared/lib/backend.js";
export {
  createSharedDataClient,
  type SharedDataClient,
} from "./shared/lib/shared-data.js";
export * from "./shared/lib/result-http.js";
export { watchSteamStatusWithRecovery } from "./shared/lib/steam-status-watch.js";
