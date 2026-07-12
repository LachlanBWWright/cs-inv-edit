import { Show } from "solid-js";
import type {
  ApplyStatTrakSwapRequest,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  ConnectionStatus,
  DeleteItemRequest,
  GiftItemRequest,
  HealthStatus,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
  RemoveItemNameRequest,
  SetItemNameRequest,
  SettingsData,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import { AccountView } from "./components/AccountView.js";
import { InventoryView } from "./components/InventoryView.js";
import { ItemManagementView } from "./components/ItemManagementView.js";
import { NameTagsView } from "./components/NameTagsView.js";
import { OperationsView } from "./components/OperationsView.js";
import { SettingsView } from "./components/SettingsView.js";
import { Sidebar } from "./components/Sidebar.js";
import { StickersView } from "./components/StickersView.js";
import { StorageView } from "./components/StorageView.js";
import { ToolsView } from "./components/ToolsView.js";
import { TradeUpView } from "./components/TradeUpView.js";
import { Alert } from "./components/ui/Alert.js";
import { ToastViewport, type ToastItem } from "./components/ui/ToastViewport.js";

export interface AppViewProps {
  view: string;
  setView: (view: string) => void;
  selectedItemId: string | undefined;
  setSelectedItemId: (itemId: string | undefined) => void;
  statusMessage: string;
  health: HealthStatus | undefined;
  connection: ConnectionStatus | undefined;
  inventory: InventorySnapshot | undefined;
  settings: SettingsData | undefined;
  receipts: OperationReceipt[] | undefined;
  events: OperationEvent[] | undefined;
  toasts: ToastItem[];
  platform: "desktop" | "web";
  onSwitchAccount: () => void;
  onRefreshInventory: () => void;
  onDismissToast: (id: string) => void;
  onConnect: (input: { username?: string; password?: string }) => Promise<void>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onToast: (toast: Omit<ToastItem, "id">) => void;
  onInventoryRefresh: () => void;
  onInventoryRename: (input: SetItemNameRequest) => Promise<unknown>;
  onRemoveName: (input: RemoveItemNameRequest) => Promise<unknown>;
  onOpenContainer: (input: { itemId: string }) => Promise<unknown>;
  onStorageSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onTradeUpSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onStickerSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onNameTagApply: (input: SetItemNameRequest) => Promise<OperationReceipt>;
  onNameTagRemove: (input: RemoveItemNameRequest) => Promise<OperationReceipt>;
  onToolApplyStatTrakSwap: (input: ApplyStatTrakSwapRequest) => Promise<OperationReceipt>;
  onToolApplyStrangePart: (input: ApplyStrangePartRequest) => Promise<OperationReceipt>;
  onToolApplyToolToItem: (input: ApplyToolToItemRequest) => Promise<OperationReceipt>;
  onToolApplyToolToBaseItem: (input: ApplyToolToBaseItemRequest) => Promise<OperationReceipt>;
  onItemDelete: (input: DeleteItemRequest) => Promise<OperationReceipt>;
  onItemUse: (input: UseItemRequest) => Promise<OperationReceipt>;
  onItemUseMultiple: (input: UseMultipleItemsRequest) => Promise<OperationReceipt>;
  onItemGift: (input: GiftItemRequest) => Promise<OperationReceipt>;
  onSaveSettings: (next: SettingsData) => Promise<void>;
}

export function AppView(props: AppViewProps) {
  return (
    <main class="min-h-screen bg-app text-slate-50 lg:grid lg:grid-cols-[280px_1fr]">
      <Sidebar view={props.view} setView={props.setView} platform={props.platform} health={props.health} connection={props.connection} inventory={props.inventory} onSwitchAccount={props.onSwitchAccount} onRefreshInventory={props.onRefreshInventory} />

      <section class="p-5 sm:p-7">
        <Show when={props.statusMessage}>
          <Alert class="mb-5">{props.statusMessage}</Alert>
        </Show>

        <Show when={props.view === "account"}>
          <AccountView
            connection={props.connection}
            onConnect={props.onConnect}
            onSubmitSteamGuard={props.onSubmitSteamGuard}
            onDisconnect={props.onDisconnect}
            onToast={props.onToast}
          />
        </Show>
        <Show when={props.view === "inventory"}>
          <InventoryView
            inventory={props.inventory}
            selectedItemId={props.selectedItemId}
            setSelectedItemId={props.setSelectedItemId}
            connection={props.connection}
            settings={props.settings}
            onRefresh={props.onInventoryRefresh}
            onRename={props.onInventoryRename}
            onRemoveName={props.onRemoveName}
            onOpenContainer={props.onOpenContainer}
            onToast={props.onToast}
          />
        </Show>
        <Show when={props.view === "storage"}>
          <StorageView inventory={props.inventory} onSubmit={props.onStorageSubmit} onRefresh={props.onInventoryRefresh} />
        </Show>
        <Show when={props.view === "tradeups"}>
          <TradeUpView inventory={props.inventory} onSubmit={props.onTradeUpSubmit} />
        </Show>
        <Show when={props.view === "stickers"}>
          <StickersView inventory={props.inventory} onSubmit={props.onStickerSubmit} />
        </Show>
        <Show when={props.view === "nametags"}>
          <NameTagsView inventory={props.inventory} onApply={props.onNameTagApply} onRemove={props.onNameTagRemove} />
        </Show>
        <Show when={props.view === "tools"}>
          <ToolsView
            onApplyStatTrakSwap={props.onToolApplyStatTrakSwap}
            onApplyStrangePart={props.onToolApplyStrangePart}
            onApplyToolToItem={props.onToolApplyToolToItem}
            onApplyToolToBaseItem={props.onToolApplyToolToBaseItem}
          />
        </Show>
        <Show when={props.view === "item-management"}>
          <ItemManagementView
            onDeleteItem={props.onItemDelete}
            onUseItem={props.onItemUse}
            onUseMultipleItems={props.onItemUseMultiple}
            onGiftItem={props.onItemGift}
          />
        </Show>
        <Show when={props.view === "operations"}>
          <OperationsView receipts={props.receipts} events={props.events} />
        </Show>
        <Show when={props.view === "settings"}>
          <SettingsView settings={props.settings} onRefresh={props.onInventoryRefresh} onSave={props.onSaveSettings} onToast={props.onToast} />
        </Show>
      </section>

      <ToastViewport toasts={props.toasts} onDismiss={props.onDismissToast} />
    </main>
  );
}
