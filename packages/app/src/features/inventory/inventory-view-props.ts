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
import type { CompactMode } from "../../shared/ui-types.js";
import type { InventoryMode } from "../shell/view.js";
import type { InventorySort } from "./inventory-view-utils.js";

export interface InventoryMarketActions {
  preview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  scanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
}

export interface InventoryRenameActions {
  rename: (input: {
    subjectItemId: string;
    toolItemId: string;
    name: string;
  }) => Promise<unknown>;
  removeName: (input: { itemId: string }) => Promise<unknown>;
}

export interface InventoryStorageActions {
  loadContents: (casketId: string) => Promise<OperationReceipt>;
  moveFrom: (input: {
    casketId: string;
    itemId: string;
  }) => Promise<OperationReceipt>;
  moveInto: (input: {
    casketId: string;
    itemId: string;
  }) => Promise<OperationReceipt>;
}

export interface InventoryTradeUpActions {
  execute: (input: { itemIds: string[] }) => Promise<OperationReceipt>;
}

export interface InventoryContainerActions {
  open: (
    input: OpenContainerRequest,
    suppressToast?: boolean,
  ) => Promise<OperationReceipt>;
  purchaseTerminal: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  loadTerminalOffer: (terminalId: string) => Promise<OperationReceipt>;
}

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
  compactMode: CompactMode;
  marketActions: InventoryMarketActions;
  renameActions: InventoryRenameActions;
  containerActions: InventoryContainerActions;
  storageActions: InventoryStorageActions;
  tradeUpActions: InventoryTradeUpActions;
  onRefresh: () => void;
}
