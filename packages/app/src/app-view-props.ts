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
  PriceScanResult,
  ProtocolTraceEntry,
  RemoveItemNameRequest,
  RelatedItemDto,
  SetItemNameRequest,
  SettingsData,
  StoreSnapshot,
  PurchaseSession,
  InitializeStorePurchaseRequest,
  SteamAccountProfile,
  SteamAccountTradesCollection,
  SteamTradesSnapshot,
  SteamInventoryServiceGames,
  TF2FeatureSnapshot,
  CS2FeatureSnapshot,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import type { ToastItem } from "./components/ui/ToastViewport.js";
import type { AppScreen } from "./view.js";
import type { UIActionOutcome } from "./lib/ui-action-outcome.js";
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
  steamServiceInventory: GameInventorySnapshot | undefined;
  steamServiceGames: SteamInventoryServiceGames | undefined;
  steamServiceGamesLoading: boolean;
  steamServiceAppId: number | undefined;
  setSteamServiceAppId: (appId: number | undefined) => void;
  tf2Inventory: GameInventorySnapshot | undefined;
  tf2Features: TF2FeatureSnapshot | undefined;
  cs2Features: CS2FeatureSnapshot | undefined;
  tf2ProtocolEntries: ProtocolTraceEntry[];
  dota2Inventory: GameInventorySnapshot | undefined;
  gameInventoryLoading: Record<"steam" | "tf2" | "dota2", boolean>;
  armory: ArmorySnapshot | undefined;
  store: StoreSnapshot | undefined;
  tf2Store: StoreSnapshot | undefined;
  trades: SteamTradesSnapshot | undefined;
  tradeAccounts: SteamAccountTradesCollection | undefined;
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
  onConnect: (input: {
    username?: string;
    password?: string;
  }) => Promise<UIActionOutcome>;
  onStartSteamQR: () => Promise<UIActionOutcome>;
  onSubmitSteamGuard: (input: { code: string }) => Promise<UIActionOutcome>;
  onDisconnect: () => Promise<UIActionOutcome>;
  onInventoryRefresh: (suppressToast?: boolean) => Promise<boolean>;
  onGameInventoryRefresh: (
    game: "steam" | "tf2" | "dota2",
    suppressToast?: boolean,
  ) => void;
  onSteamServiceRefresh: (appId: number) => void;
  onGameOperation: (
    type: string,
    input: unknown,
    suppressToast?: boolean,
  ) => Promise<OperationReceipt>;
  onArmoryRefresh: () => Promise<unknown>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onArmoryRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt>;
  onStoreRefresh: () => Promise<unknown>;
  onTF2StoreRefresh: () => Promise<unknown>;
  onStorePurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  onTF2StorePurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  onStoreReconcile: (id: string) => Promise<PurchaseSession>;
  onTradesRefresh: (steamId?: string) => Promise<unknown>;
  onInventoryRename: (input: SetItemNameRequest) => Promise<unknown>;
  onRemoveName: (input: RemoveItemNameRequest) => Promise<unknown>;
  onOpenContainer: (
    input: OpenContainerRequest,
    suppressToast?: boolean,
  ) => Promise<unknown>;
  onTerminalSubmit: (
    type: string,
    input?: unknown,
  ) => Promise<OperationReceipt>;
  onStorageSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onTradeUpSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onStickerSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onNameTagApply: (input: SetItemNameRequest) => Promise<OperationReceipt>;
  onNameTagRemove: (input: RemoveItemNameRequest) => Promise<OperationReceipt>;
  onToolApplyStatTrakSwap: (
    input: ApplyStatTrakSwapRequest,
  ) => Promise<OperationReceipt>;
  onToolApplyStrangePart: (
    input: ApplyStrangePartRequest,
  ) => Promise<OperationReceipt>;
  onToolApplyToolToItem: (
    input: ApplyToolToItemRequest,
  ) => Promise<OperationReceipt>;
  onToolApplyToolToBaseItem: (
    input: ApplyToolToBaseItemRequest,
  ) => Promise<OperationReceipt>;
  onItemDelete: (input: DeleteItemRequest) => Promise<OperationReceipt>;
  onItemUse: (input: UseItemRequest) => Promise<OperationReceipt>;
  onItemUseMultiple: (
    input: UseMultipleItemsRequest,
  ) => Promise<OperationReceipt>;
  onItemGift: (input: GiftItemRequest) => Promise<OperationReceipt>;
  onSaveSettings: (next: SettingsData) => Promise<UIActionOutcome>;
}
