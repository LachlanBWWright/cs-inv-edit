import type { LocalAgentClient } from "../../shared/lib/backend.js";
import type { SharedDataClient } from "../../shared/lib/shared-data.js";
import type { AppPlatform } from "../../shared/ui-types.js";

export interface AppProps {
  backend: LocalAgentClient;
  data: SharedDataClient;
  platform: AppPlatform;
}
