import { render } from "solid-js/web";
import { App, type AppBackendClient } from "@cs-inv-edit/app";
import "@cs-inv-edit/app/styles.css";

const backendBase = "http://127.0.0.1:7331";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBase}${path}`, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

const backend: AppBackendClient = {
  health: () => requestJson("/health"),
  inventory: () => requestJson("/inventory"),
  refreshInventory: () => requestJson("/inventory/refresh", { method: "POST" }),
  submitOperation: (type, input) => requestJson(`/operations/${encodeURIComponent(type)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }),
  operations: () => requestJson("/operations"),
  events: () => requestJson("/events"),
  settings: () => requestJson("/settings"),
  connectSteam: (input) => requestJson("/steam/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }),
  submitSteamGuard: (input) => requestJson("/steam/guard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }),
  disconnectSteam: () => requestJson("/steam/disconnect", { method: "POST" }),
};

render(() => <App backend={backend} platform="web" />, document.getElementById("root")!);
