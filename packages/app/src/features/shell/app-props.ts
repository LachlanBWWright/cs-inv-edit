import type { LocalAgentClient } from "../../shared/lib/backend.js";
import type { SharedDataClient } from "../../shared/lib/shared-data.js";

export interface AppProps {
  backend: LocalAgentClient;
  data: SharedDataClient;
  platform: "desktop" | "web";
}
