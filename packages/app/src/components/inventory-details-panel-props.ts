import type { InitializeStorePurchaseRequest, InventoryItemDto, PriceScanResult, PurchaseSession, RelatedItemDto, SettingsData } from "@cs-inv-edit/contracts";
import type { RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import type { ReturnEstimate } from "./roi-utils.js";

export interface InventoryDetailsPanelProps {
  selectedItem: InventoryItemDto | undefined;
  steamId?: string;
  settings: SettingsData | undefined;
  pending: boolean;
  renameOpen: boolean;
  draftName: string;
  selectedToolId: string;
  inventoryDebugEnabled: boolean;
  nameTagTools: InventoryItemDto[];
  compatibleContainerKey: InventoryItemDto | undefined;
  compatibleContainerKeys: InventoryItemDto[];
  selectedContainerKeyId: string;
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  containerStatusMessage: string;
  terminalOfferState?: {
    terminalId: string;
    state: "loading" | "error";
    message: string;
  };
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: (terminalSelection?: {
    pointsRemaining?: number;
    volatileLimit?: number;
  }) => Promise<void> | void;
  onTerminalPurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
  onSelectedContainerKeyChange: (value: string) => void;
  selectedMarketPreview?: RelatedItemDto;
  selectedMarketLoading?: boolean;
  selectedPriceScan?: PriceScanResult;
  selectedPriceScanLoading?: boolean;
  tradeUpReturnEstimate?: ReturnEstimate;
  tradeUpReturnLoading?: boolean;
  onOpenCollection?: (
    title: string,
    items: RelatedItemDto[],
    context: RelatedItemPreviewContext,
  ) => void;
  onShowContents?: () => void;
  onLoadStorageContents: (casketId: string) => Promise<boolean>;
  onViewStorageContents?: () => Promise<void> | void;
  onPreviewTradeUp?: (item: InventoryItemDto) => void;
}
