import { render } from "solid-js/web";
import { App, type AppBackendClient } from "@cs-inv-edit/app";
import "@cs-inv-edit/app/styles.css";

const backendBase = "http://127.0.0.1:7331";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${backendBase}${path}`, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

const backend: AppBackendClient = {
  health: () => request("/health"),
  inventory: () => request("/inventory"),
  refreshInventory: () => request("/inventory/refresh", { method: "POST" }),
  submitOperation: (type, input) =>
    request(`/operations/${encodeURIComponent(type)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
    }),
  events: () => request("/events"),
  getSettings: () => request("/settings"),
  updateSettings: (settings) => request("/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }),
  connectSteam: (input) => request("/steam/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }),
  submitSteamGuard: (input) => request("/steam/guard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }),
  disconnectSteam: () => request("/steam/disconnect", { method: "POST" }),
};

render(() => <App backend={backend} platform="web" />, document.getElementById("root")!);
