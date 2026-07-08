import { createResource, createSignal, createEffect, Show } from "solid-js";
import type { ApplyStatTrakSwapRequest, ApplyStrangePartRequest, ApplyToolToBaseItemRequest, ApplyToolToItemRequest, DeleteItemRequest, GiftItemRequest, OperationReceipt, RemoveItemNameRequest, SetItemNameRequest, SettingsData, UseItemRequest, UseMultipleItemsRequest } from "@cs-inv-edit/contracts";
import { AccountView } from "./components/AccountView.js";
import { InventoryView } from "./components/InventoryView.js";
import { ItemManagementView } from "./components/ItemManagementView.js";
import { NameTagsView } from "./components/NameTagsView.js";
import { OperationsView } from "./components/OperationsView.js";
import { SettingsView } from "./components/SettingsView.js";
import { Sidebar } from "./components/Sidebar.js";
import { StickersView } from "./components/StickersView.js";
import { StorageView } from "./components/StorageView.js";
import { TradeUpView } from "./components/TradeUpView.js";
import { ToolsView } from "./components/ToolsView.js";
import { createOperationApi } from "./lib/api.js";
export type { AppBackendClient } from "./lib/backend.js";
export * from "./lib/result-http.js";

import type { AppBackendClient } from "./lib/backend.js";

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
  const [connection, { refetch: refetchConnection }] = createResource(() => props.backend.steamStatus?.() ?? Promise.resolve({ state: "disconnected" as const }));

  createEffect(() => {
    if (connection() && connection()?.state !== "connected" && view() !== "settings") {
      setView("account");
    }
  });

  const settleOperation = async (receiptPromise: Promise<OperationReceipt>) => {
    const receipt = await receiptPromise;
    if (receipt.state === "completed" || receipt.state === "awaiting_gc_confirmation") {
      await props.backend.refreshInventory();
      await refetchInventory();
    }
    await Promise.all([refetchOperations(), refetchEvents()]);
    return receipt;
  };

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
    return settleOperation(props.backend.submitOperation(type, input));
  };

  const operationApi = createOperationApi(props.backend);

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

        <Show when={view() === "account"}>
          <AccountView
            connection={connection()}
            onConnect={async (input) => {
              if (props.backend.connectSteam) {
                const res = await props.backend.connectSteam(input);
                if (res.state === "error") throw new Error(res.detail || "Connection failed");
              }
              await refetchConnection();
              if (connection()?.state === "connected") setView("inventory");
            }}
            onSubmitSteamGuard={async (input) => {
              if (props.backend.submitSteamGuard) {
                const res = await props.backend.submitSteamGuard(input);
                if (res.state === "error") throw new Error(res.detail || "Steam Guard failed");
              }
              await refetchConnection();
              if (connection()?.state === "connected") setView("inventory");
            }}
            onDisconnect={async () => {
              if (props.backend.disconnectSteam) await props.backend.disconnectSteam();
              await refetchConnection();
            }}
          />
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
        <Show when={view() === "name-tags"}>
          <NameTagsView
            inventory={inventory()}
            onApply={(input: SetItemNameRequest) => settleOperation(operationApi.applyNameTag(input))}
            onRemove={(input: RemoveItemNameRequest) => settleOperation(operationApi.removeNameTag(input))}
          />
        </Show>
        <Show when={view() === "tools"}>
          <ToolsView
            onApplyStatTrakSwap={(input: ApplyStatTrakSwapRequest) => settleOperation(operationApi.applyStatTrakSwap(input))}
            onApplyStrangePart={(input: ApplyStrangePartRequest) => settleOperation(operationApi.applyStrangePart(input))}
            onApplyToolToItem={(input: ApplyToolToItemRequest) => settleOperation(operationApi.applyToolToItem(input))}
            onApplyToolToBaseItem={(input: ApplyToolToBaseItemRequest) => settleOperation(operationApi.applyToolToBaseItem(input))}
          />
        </Show>
        <Show when={view() === "item-management"}>
          <ItemManagementView
            onDeleteItem={(input: DeleteItemRequest) => settleOperation(operationApi.deleteItem(input))}
            onUseItem={(input: UseItemRequest) => settleOperation(operationApi.useItem(input))}
            onUseMultipleItems={(input: UseMultipleItemsRequest) => settleOperation(operationApi.useMultipleItems(input))}
            onGiftItem={(input: GiftItemRequest) => settleOperation(operationApi.giftItem(input))}
          />
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
