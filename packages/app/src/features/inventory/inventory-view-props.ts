import type {
  ConnectionStatus,
  InitializeStorePurchaseRequest,
  InventoryItemDto,
  InventorySnapshot,
  OpenContainerRequest,
  OperationReceipt,
  PriceScanResult,
  PurchaseSession,
  RelatedItemDto,
  SettingsData,
} from "@cs-inv-edit/contracts";
import type { InventoryMode } from "../shell/view.js";
import type { InventorySort } from "./inventory-view-utils.js";

export interface InventoryViewProps {
  mode: InventoryMode;
  inventory: InventorySnapshot | undefined;
  loading?: boolean;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string | undefined) => void;
  connection: ConnectionStatus | undefined;
  settings: SettingsData | undefined;
  query: string;
  kindFilter: "all" | InventoryItemDto["kind"];
  rarityFilter: string;
  weaponFilter: string;
  collectionFilter: string;
  sort: InventorySort;
  marketPrices: ReadonlyMap<string, number>;
  compactMode: "icons" | "concise" | "detailed";
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onRename: (input: {
    subjectItemId: string;
    toolItemId: string;
    name: string;
  }) => Promise<unknown>;
  onRemoveName: (input: { itemId: string }) => Promise<unknown>;
  onOpenContainer: (
    input: OpenContainerRequest,
    suppressToast?: boolean,
  ) => Promise<unknown>;
  onTerminalPurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
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
  onRefresh: () => void;
}
