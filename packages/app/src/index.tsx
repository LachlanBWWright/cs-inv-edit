import { createResource, createSignal, Show } from "solid-js";
import type { SettingsData } from "@cs-inv-edit/contracts";
import { InventoryView } from "./components/InventoryView";
import { OperationsView } from "./components/OperationsView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { StickersView } from "./components/StickersView";
import { StorageView } from "./components/StorageView";
import { TradeUpView } from "./components/TradeUpView";
export type { AppBackendClient } from "./lib/backend";

import type { AppBackendClient } from "./lib/backend";

export interface AppProps {
  backend: AppBackendClient;
  platform: "desktop" | "web";
}

export function App(props: AppProps) {
  const [view, setView] = createSignal("inventory");
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>();
  const [statusMessage, setStatusMessage] = createSignal<string>("");

  const [health] = createResource(() => props.backend.health());
  const [inventory, { refetch: refetchInventory }] = createResource(() => props.backend.inventory());
  const [receipts, { refetch: refetchOperations }] = createResource(() => props.backend.operations());
  const [events, { refetch: refetchEvents }] = createResource(() => props.backend.events());
  const [settings, { refetch: refetchSettings }] = createResource(() => props.backend.settings());

  const refreshAll = async () => {
    setStatusMessage("Refreshing backend state");
    try {
      await Promise.all([refetchInventory(), refetchOperations(), refetchEvents(), refetchSettings()]);
    } finally {
      setStatusMessage("");
    }
  };

  const submitOperation = async (type: string, input?: unknown) => {
    setStatusMessage(`Submitting ${type}`);
    const receipt = await props.backend.submitOperation(type, input);
    await Promise.all([refetchOperations(), refetchEvents()]);
    return receipt;
  };

  const saveSettings = async (next: SettingsData) => {
    await props.backend.submitOperation("settings", next);
    await refetchSettings();
  };

  return (
    <main class="min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[260px_1fr]">
      <Sidebar view={view()} setView={setView} platform={props.platform} health={health()} />

      <section class="p-5 sm:p-7">
        <Show when={statusMessage()}>
          <div class="mb-5 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">{statusMessage()}</div>
        </Show>

        <Show when={view() === "inventory"}>
          <InventoryView inventory={inventory()} selectedItemId={selectedItemId()} setSelectedItemId={setSelectedItemId} onRefresh={() => void refreshAll()} onQueueOperation={() => void submitOperation("storage.move-in")} />
        </Show>
        <Show when={view() === "storage"}>
          <StorageView inventory={inventory()} onSubmit={submitOperation} onRefresh={() => void refreshAll()} />
        </Show>
        <Show when={view() === "trade-ups"}>
          <TradeUpView inventory={inventory()} onSubmit={submitOperation} />
        </Show>
        <Show when={view() === "stickers"}>
          <StickersView inventory={inventory()} onSubmit={submitOperation} />
        </Show>
        <Show when={view() === "operations"}>
          <OperationsView receipts={receipts()} events={events()} />
        </Show>
        <Show when={view() === "settings"}>
          <SettingsView settings={settings()} onRefresh={() => void refreshAll()} onSave={saveSettings} />
        </Show>
      </section>
    </main>
  );
}
