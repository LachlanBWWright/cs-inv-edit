import { createMemo, createSignal, Match, Show, Switch } from "solid-js";
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
  OpenContainerRequest,
  RemoveItemNameRequest,
  RelatedItemDto,
  SetItemNameRequest,
  SettingsData,
  StoreSnapshot,
  PurchaseSession,
  InitializeStorePurchaseRequest,
  SteamAccountProfile,
  SteamTradesSnapshot,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import { AccountView } from "./components/AccountView.js";
import { ArmoryView } from "./components/ArmoryView.js";
import { StoreView } from "./components/StoreView.js";
import { InventoryView } from "./components/InventoryView.js";
import { GameInventoryView } from "./components/GameInventoryView.js";
import { TradesView } from "./components/TradesView.js";
import { Sidebar } from "./components/Sidebar.js";
import { Alert } from "./components/ui/Alert.js";
import { ToastViewport, type ToastItem } from "./components/ui/ToastViewport.js";
import type { AppScreen } from "./view.js";
import { isEconomyInventoryScreen, isInventoryScreen } from "./view.js";
import { itemWeaponName, type InventorySort } from "./components/inventory-view-utils.js";

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
  steamInventory: GameInventorySnapshot | undefined;
  tf2Inventory: GameInventorySnapshot | undefined;
  dota2Inventory: GameInventorySnapshot | undefined;
  armory: ArmorySnapshot | undefined;
  store: StoreSnapshot | undefined;
  trades: SteamTradesSnapshot | undefined;
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
  onGameInventoryRefresh: (game: "steam" | "tf2" | "dota2") => void;
  onArmoryRefresh: () => Promise<unknown>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onArmoryRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt>;
  onStoreRefresh: () => Promise<unknown>;
  onStorePurchase: (input: InitializeStorePurchaseRequest) => Promise<PurchaseSession>;
  onStoreReconcile: (id: string) => Promise<PurchaseSession>;
  onTradesRefresh: () => Promise<unknown>;
  onInventoryRename: (input: SetItemNameRequest) => Promise<unknown>;
  onRemoveName: (input: RemoveItemNameRequest) => Promise<unknown>;
  onOpenContainer: (input: OpenContainerRequest) => Promise<unknown>;
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
  const [rarityFilter, setRarityFilter] = createSignal("all");
  const [weaponFilter, setWeaponFilter] = createSignal("all");
  const [collectionFilter, setCollectionFilter] = createSignal("all");
  const [sort, setSort] = createSignal<InventorySort>("name");
  const rarityOptions = createMemo(() => [...new Set((props.inventory?.items ?? []).map((item) => item.rarity).filter((value): value is string => !!value))].sort());
  const weaponOptions = createMemo(() => [...new Set((props.inventory?.items ?? []).map(itemWeaponName).filter((value): value is string => !!value))].sort());
  const collectionOptions = createMemo(() => [...new Set((props.inventory?.items ?? []).map((item) => item.collection).filter((value): value is string => !!value))].sort());

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
        rarityFilter={rarityFilter()}
        setRarityFilter={setRarityFilter}
        weaponFilter={weaponFilter()}
        setWeaponFilter={setWeaponFilter}
        collectionFilter={collectionFilter()}
        setCollectionFilter={setCollectionFilter}
        sort={sort()}
        setSort={setSort}
        rarityOptions={rarityOptions()}
        weaponOptions={weaponOptions()}
        collectionOptions={collectionOptions()}
        compactMode={props.compactMode}
        setCompactMode={props.setCompactMode}
        onAddAccount={props.onAddAccount}
        onSignInAccount={props.onSignInAccount}
        onSignOutAccount={props.onSignOutAccount}
        onDeleteAccount={props.onDeleteAccount}
        onRefreshInventory={props.onRefreshInventory}
        onRefreshCurrentInventory={() => {
          if (isInventoryScreen(props.view)) return props.onInventoryRefresh();
          if (props.view === "steam-inventory") return props.onGameInventoryRefresh("steam");
          if (props.view === "tf2-inventory") return props.onGameInventoryRefresh("tf2");
          if (props.view === "dota2-inventory") return props.onGameInventoryRefresh("dota2");
        }}
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
        kindFilter={props.kindFilter}
        rarityFilter={rarityFilter()}
        weaponFilter={weaponFilter()}
        collectionFilter={collectionFilter()}
        sort={sort()}
        compactMode={props.compactMode}
        onMarketPreview={props.onMarketPreview}
        onRename={props.onInventoryRename}
        onRemoveName={props.onRemoveName}
        onOpenContainer={props.onOpenContainer}
        onToast={props.onToast}
        onRefresh={props.onInventoryRefresh}
          />
        </Match>
        <Match when={isEconomyInventoryScreen(props.view)}>
          <GameInventoryView
			game={props.view === "steam-inventory" ? "steam" : props.view === "tf2-inventory" ? "tf2" : "dota2"}
            connected={props.connection ? props.connection.state === "connected" : undefined}
        snapshot={props.view === "steam-inventory" ? props.steamInventory : props.view === "tf2-inventory" ? props.tf2Inventory : props.dota2Inventory}
        query={props.query}
        selectedAssetId={props.selectedItemId}
        setSelectedAssetId={props.setSelectedItemId}
        compactMode={props.compactMode}
        onRefresh={() => props.onGameInventoryRefresh(props.view === "steam-inventory" ? "steam" : props.view === "tf2-inventory" ? "tf2" : "dota2")}
          />
        </Match>
        <Match when={props.view === "armory"}><ArmoryView armory={props.armory} settings={props.settings} onRefresh={props.onArmoryRefresh} onMarketPreview={props.onMarketPreview} onRedeem={props.onArmoryRedeem} /></Match>
        <Match when={props.view === "store"}><StoreView store={props.store} settings={props.settings} onRefresh={props.onStoreRefresh} onPurchase={props.onStorePurchase} onReconcile={props.onStoreReconcile} /></Match>
        <Match when={props.view === "trades"}><TradesView snapshot={props.trades} onRefresh={props.onTradesRefresh} onReconnect={() => props.setView("account")} /></Match>
        </Switch>
      </section>

      <ToastViewport toasts={props.toasts} onDismiss={props.onDismissToast} />
    </main>
  );
}
