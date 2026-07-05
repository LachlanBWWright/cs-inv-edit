import type { AppBackendClient } from "@cs-inv-edit/app";

declare global {
  interface Window {
    cs2: AppBackendClient;
  }
}
