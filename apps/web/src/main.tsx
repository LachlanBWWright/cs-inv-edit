import { render } from "solid-js/web";
import { App, type AppBackendClient } from "@cs-inv-edit/app";
import "@cs-inv-edit/app/styles.css";

const backendBase = "http://127.0.0.1:7331";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${backendBase}${path}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

const backend: AppBackendClient = {
  health: () => getJson("/health"),
  inventory: () => getJson("/inventory"),
  submitOperation: (type, input) =>
    fetch(`${backendBase}/operations/${encodeURIComponent(type)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
    }).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    }),
};

render(() => <App backend={backend} platform="web" />, document.getElementById("root")!);
