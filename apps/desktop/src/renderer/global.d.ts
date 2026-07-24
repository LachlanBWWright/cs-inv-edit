import type { LocalAgentClient } from "@cs-inv-edit/app";

declare global {
  interface Window {
    cs2: LocalAgentClient;
  }
}
