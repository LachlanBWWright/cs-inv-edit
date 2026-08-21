import type {
  ArmoryRedeemRequest,
  ArmorySnapshot,
  ConnectionStatus,
  GameInventorySnapshot,
  HealthStatus,
  InventoryItemDto,
  InventorySnapshot,
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
} from "@cs-inv-edit/contracts";
import type { CompactMode } from "../../shared/ui-types.js";
import type { ToastItem } from "../../shared/ui/ToastViewport.js";
import type { AppScreen } from "./view.js";
import type { UIActionOutcome } from "../../shared/lib/ui-action-outcome.js";
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
  accountLoginOnly: boolean;
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
  gameInventoryLoading: Record<
    import("../../shared/ui-types.js").EconomyGame,
    boolean
  >;
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
  compactMode: CompactMode;
  setCompactMode: (value: CompactMode) => void;
  toasts: ToastItem[];
  platform: import("../../shared/ui-types.js").AppPlatform;
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
    game: import("../../shared/ui-types.js").EconomyGame,
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
  ) => Promise<OperationReceipt>;
  onLoadTerminalOffer: (terminalId: string) => Promise<OperationReceipt>;
  onLoadStorageContents: (casketId: string) => Promise<OperationReceipt>;
  onMoveFromStorage: (input: {
    casketId: string;
    itemId: string;
  }) => Promise<OperationReceipt>;
  onMoveIntoStorage: (input: {
    casketId: string;
    itemId: string;
  }) => Promise<OperationReceipt>;
  onExecuteTradeUp: (input: {
    itemIds: string[];
  }) => Promise<OperationReceipt>;
  onSaveSettings: (next: SettingsData) => Promise<UIActionOutcome>;
}
