import { Match, Show, Switch } from "solid-js";
import type {
  ApplyStatTrakSwapRequest,
  ArmoryRedeemRequest,
  ArmorySnapshot,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  ConnectionStatus,
  DeleteItemRequest,
  GiftItemRequest,
  GameInventorySnapshot,
  HealthStatus,
  InventoryItemDto,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
  RemoveItemNameRequest,
  RelatedItemDto,
  SetItemNameRequest,
  SettingsData,
  SteamAccountProfile,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import { AccountView } from "./components/AccountView.js";
import { ArmoryView } from "./components/ArmoryView.js";
import { InventoryView } from "./components/InventoryView.js";
import { GameInventoryView } from "./components/GameInventoryView.js";
import { Sidebar } from "./components/Sidebar.js";
import { Alert } from "./components/ui/Alert.js";
import { ToastViewport, type ToastItem } from "./components/ui/ToastViewport.js";
import type { AppScreen } from "./view.js";
import { isEconomyInventoryScreen, isInventoryScreen } from "./view.js";

export interface AppViewProps {
  view: AppScreen;
  setView: (view: AppScreen) => void;
  selectedItemId: string | undefined;
  setSelectedItemId: (itemId: string | undefined) => void;
  statusMessage: string;
  health: HealthStatus | undefined;
  connection: ConnectionStatus | undefined;
  accounts: SteamAccountProfile[];
  accountUsername: string;
  inventory: InventorySnapshot | undefined;
  inventoryLoading: boolean;
  tf2Inventory: GameInventorySnapshot | undefined;
  dota2Inventory: GameInventorySnapshot | undefined;
  armory: ArmorySnapshot | undefined;
  settings: SettingsData | undefined;
  query: string;
  setQuery: (value: string) => void;
  kindFilter: "all" | InventoryItemDto["kind"];
  setKindFilter: (value: "all" | InventoryItemDto["kind"]) => void;
  compactMode: "icons" | "concise" | "detailed";
  setCompactMode: (value: "icons" | "concise" | "detailed") => void;
  receipts: OperationReceipt[] | undefined;
  events: OperationEvent[] | undefined;
  toasts: ToastItem[];
  platform: "desktop" | "web";
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onDismissToast: (id: string) => void;
  onConnect: (input: { username?: string; password?: string }) => Promise<void>;
  onStartSteamQR: () => Promise<void>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onToast: (toast: Omit<ToastItem, "id">) => void;
  onInventoryRefresh: () => void;
  onGameInventoryRefresh: (game: "tf2" | "dota2") => void;
  onArmoryRefresh: () => Promise<unknown>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onArmoryRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt>;
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
    <main class="flex h-screen min-h-0 flex-col overflow-hidden bg-app text-slate-50">
      <Sidebar
        view={props.view}
        setView={props.setView}
        platform={props.platform}
        health={props.health}
        connection={props.connection}
        accounts={props.accounts}
        inventory={props.inventory}
        settings={props.settings}
        query={props.query}
        setQuery={props.setQuery}
        kindFilter={props.kindFilter}
        setKindFilter={props.setKindFilter}
        compactMode={props.compactMode}
        setCompactMode={props.setCompactMode}
        onAddAccount={props.onAddAccount}
        onSignInAccount={props.onSignInAccount}
        onSignOutAccount={props.onSignOutAccount}
        onDeleteAccount={props.onDeleteAccount}
        onRefreshInventory={props.onRefreshInventory}
        onOpenAccount={() => props.setView("account")}
        onSaveSettings={props.onSaveSettings}
      />

      <section class="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6 lg:p-7">
        <Show when={props.statusMessage}>
          <Alert class="mb-5">{props.statusMessage}</Alert>
        </Show>

        <Switch>
        <Match when={props.view === "account"}>
          <AccountView
            connection={props.connection}
            initialUsername={props.accountUsername}
            onConnect={props.onConnect}
            onStartSteamQR={props.onStartSteamQR}
            onSubmitSteamGuard={props.onSubmitSteamGuard}
            onDisconnect={props.onDisconnect}
            onToast={props.onToast}
          />
        </Match>
        <Match when={isInventoryScreen(props.view)}>
          <InventoryView
			mode={isInventoryScreen(props.view) ? props.view : "inventory"}
            inventory={props.inventory}
            loading={props.inventoryLoading}
            selectedItemId={props.selectedItemId}
            setSelectedItemId={props.setSelectedItemId}
            connection={props.connection}
            settings={props.settings}
            query={props.query}
            setQuery={props.setQuery}
            kindFilter={props.kindFilter}
            setKindFilter={props.setKindFilter}
            compactMode={props.compactMode}
            setCompactMode={props.setCompactMode}
            onRefresh={props.onInventoryRefresh}
            onMarketPreview={props.onMarketPreview}
            onRename={props.onInventoryRename}
            onRemoveName={props.onRemoveName}
            onOpenContainer={props.onOpenContainer}
            onToast={props.onToast}
          />
        </Match>
        <Match when={isEconomyInventoryScreen(props.view)}>
          <GameInventoryView
			game={props.view === "tf2-inventory" ? "tf2" : "dota2"}
            snapshot={props.view === "tf2-inventory" ? props.tf2Inventory : props.dota2Inventory}
            query={props.query}
            selectedAssetId={props.selectedItemId}
            setSelectedAssetId={props.setSelectedItemId}
            compactMode={props.compactMode}
            onRefresh={() => props.onGameInventoryRefresh(props.view === "tf2-inventory" ? "tf2" : "dota2")}
          />
        </Match>
        <Match when={props.view === "armory"}><ArmoryView armory={props.armory} settings={props.settings} onRefresh={props.onArmoryRefresh} onMarketPreview={props.onMarketPreview} onRedeem={props.onArmoryRedeem} /></Match>
        </Switch>
      </section>

      <ToastViewport toasts={props.toasts} onDismiss={props.onDismissToast} />
    </main>
  );
}
