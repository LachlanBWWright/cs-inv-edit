export type ConnectionState = "disconnected" | "connecting" | "awaiting_guard" | "needs_steam_guard" | "awaiting_qr" | "connected" | "error";

export interface HealthStatus {
  status: "ok" | "error";
  service: string;
  version: string;
  time: string;
}

export interface StickerDto {
  slot?: number;
  stickerId?: number;
  wear?: number;
}

export interface AppliedItemDto {
  kind: "sticker" | "charm" | "patch";
  slot?: number;
  id?: number;
  name: string;
  imageUrl?: string;
  wear?: number;
}

export interface InventoryItemDto {
  id: string;
  name: string;
  marketName?: string;
  marketPrice?: string;
  marketSalePrice?: string;
  marketSellListings?: number;
  customName?: string;
  imageUrl?: string;
  inspectUrl?: string;
  kind: "weapon_skin" | "sticker_item" | "container" | "storage_unit" | "tool_item" | "cs2_econ_item" | "unknown";
  defindex?: number;
  paintWear?: number;
  paintWearMin?: number;
  paintWearMax?: number;
  storageCount?: number;
  graffitiCharges?: number;
  casketId?: string;
  collection?: string;
  collectionItems?: RelatedItemDto[];
  tradeUpItems?: RelatedItemDto[];
  containerItems?: RelatedItemDto[];
  terminalOffers?: TerminalOfferDto[];
  terminalPointsRemaining?: number;
  exterior?: string;
  rarity?: string;
  storageLocation?: string;
  toolType?: string;
  requiredKeyDefIndexes?: number[];
  stickers?: StickerDto[];
  appliedItems?: AppliedItemDto[];
  isStatTrak?: boolean;
  isSouvenir?: boolean;
  tradable?: boolean;
  marketable?: boolean;
  tradableAfter?: string;
  unsupportedFields?: string[];
  diagnostics?: string[];
  hasCustomName?: boolean;
  isNameTagTool?: boolean;
  debug?: ItemDebugDto;
}

export interface TerminalOfferDto {
  fauxItemId: string;
  generationTime?: number;
  purchasePrice?: number;
  item: RelatedItemDto;
}

export interface RelatedItemDto {
  defindex?: number;
  paintKit?: number;
  name: string;
  marketName?: string;
  listingName?: string;
  kind?: string;
  rarity?: string;
  imageUrl?: string;
  price?: string;
  paintWear?: number;
  wearMin?: number;
  wearMax?: number;
  items?: RelatedItemDto[];
}

export interface PriceScanRequest { marketNames: string[]; currency: string; appId?: number; priceMultipliers?: Record<string, number> }
export interface PriceQuoteDto { source: string; marketName: string; currency: string; amountMinor?: number; displayPrice: string; priceMultiplier: number; adjustedAmountMinor?: number; adjustedDisplayPrice?: string; listingCount?: number; url?: string; observedAt: string }
export interface PriceScanResult { currency: string; items: Array<{ marketName: string; quotes: PriceQuoteDto[] }>; listings: PriceQuoteDto[]; errors: Array<{ source: string; message: string }>; scannedAt: string; servedAt?: string; cacheState?: "fresh" | "stale" }

export interface ItemDebugDto {
  gcId?: string;
  gcOriginalId?: string;
  gcDefIndex?: number;
  gcInventory?: number;
  gcQuantity?: number;
  gcQuality?: number;
  gcRarity?: number;
  gcPaintKit?: number;
  descriptionMatched: boolean;
  marketDescriptionUsed: boolean;
  attributes?: Record<string, number>;
}

export interface InventorySnapshot {
  items: InventoryItemDto[];
  collections?: Array<{ name: string; items: RelatedItemDto[] }>;
  refreshedAt: string;
  status?: "ready" | "requires_connection" | "loading" | "error";
  message?: string;
  error?: string;
  diagnostics?: string[];
}

export interface ArmoryOfferDto {
  campaignId: number;
  redeemId: number;
  expectedCost: number;
  generationTime: number;
  itemName?: string;
  name?: string;
  category?: string;
  items?: RelatedItemDto[];
}

export interface ArmorySnapshot {
  balance: number;
  generationTime: number;
  itemIds: string[];
  offers: ArmoryOfferDto[];
  refreshedAt: string;
  status: "ready" | "requires_connection" | "loading" | "error";
  message?: string;
  diagnostics?: string[];
}

export interface StoreOfferDto {
  id: string; itemLink: string; defIndex: number; name: string;
  description?: string; imageUrl?: string; category?: string; rarity?: string;
  currency: string; amountMinor: number; formattedPrice: string;
  saleAmountMinor?: number; formattedSalePrice?: string;
  requiresSupplementalData: boolean; supplementalDataKind?: string;
  purchasable: boolean; unsupportedReason?: string;
  items?: RelatedItemDto[];
}

export interface StoreSnapshot {
  status: "ready" | "requires_connection" | "loading" | "error";
  priceSheetVersion?: number; currency?: string; offers: StoreOfferDto[];
  refreshedAt: string; message?: string; diagnostics?: string[];
}

export interface SteamTradeItemDto {
  appId: number; contextId: string; assetId: string; amount: number;
  name: string; marketName?: string; type?: string; imageUrl?: string;
  tradable: boolean; marketable: boolean;
}

export interface SteamTradeDto {
  id: string; direction: "received" | "sent" | "history"; partnerSteamId: string;
  partnerName?: string; partnerAvatarUrl?: string; partnerProfileUrl?: string;
  message?: string; state: string; createdAt?: string; updatedAt?: string; expiresAt?: string;
  itemsToGive: SteamTradeItemDto[]; itemsToReceive: SteamTradeItemDto[];
}

export interface SteamTradesSnapshot {
  status: "ready" | "requires_connection" | "requires_reauthentication" | "loading" | "error";
  received: SteamTradeDto[]; sent: SteamTradeDto[]; history: SteamTradeDto[];
  refreshedAt: string; message?: string;
}

export interface SteamAccountTradesSnapshot {
  steamId: string; accountName: string; avatarUrl?: string; snapshot: SteamTradesSnapshot;
}

export interface SteamAccountTradesCollection {
  accounts: SteamAccountTradesSnapshot[]; refreshedAt: string;
}

export interface SteamTradeMutationResult {
  status: "submitted" | "accepted" | "blocked_by_feature_flag" | "requires_connection" | "requires_refresh" | "error";
  tradeOfferId?: string; needsMobileConfirmation?: boolean; message?: string;
}

export interface InitializeStorePurchaseRequest {
  offerId: string; quantity: number; expectedPriceSheetVersion: number;
  expectedAmountMinor: number; supplementalData?: string;
}

export type PurchaseSessionStatus = "initializing" | "awaiting_steam_authorization" | "awaiting_user" | "finalizing" | "completed" | "cancelled" | "failed" | "expired";
export interface PurchaseSession {
  id: string; status: PurchaseSessionStatus; offerId: string; defIndex: number;
  name: string; quantity: number; currency: string; amountMinor: number;
  formattedAmount: string; transactionId?: string; orderId?: string;
  checkoutUrl?: string; purchasedItemIds?: string[]; createdAt: string;
  expiresAt?: string; message?: string; diagnostics?: string[];
  errorCode?: string; errorResult?: number;
}

export interface ArmoryRedeemRequest {
  campaignId: number;
  redeemId: number;
  expectedCost: number;
  redeemableBalance: number;
  generationTime: number;
  quantity?: number;
}

export interface ConnectionStatus {
  state: ConnectionState;
  detail?: string;
  steamId?: string;
  accountName?: string;
  avatarUrl?: string;
  diagnostics?: string[];
  qrChallengeUrl?: string;
}

export interface SteamAccountProfile {
  accountName: string;
  steamId?: string;
  avatarUrl?: string;
  signedIn: boolean;
  lastSignedInAt: string;
}

export interface OperationReceipt {
  operationId: string;
  type: string;
  state: "queued" | "validating" | "encoded" | "sent" | "awaiting_gc_confirmation" | "reconciling_inventory" | "completed" | "failed" | "blocked_by_feature_flag" | "requires_validation" | "requires_connection";
  createdAt: string;
  message?: string;
  result?: OperationResult;
}

export interface OperationResult {
  openedItem?: InventoryItemDto;
  terminalOffer?: TerminalOfferDto;
  consumedItemId?: string;
  requestEMsg?: number;
  requestMethod?: string;
  requestBodyHex?: string;
  confirmation?: string;
  responseEMsg?: number;
  responseBodyHex?: string;
  beforeItemCount?: number;
  afterItemCount?: number;
  diagnostics?: string[];
}

export interface OperationEvent {
  operationId: string;
  type: string;
  state: OperationReceipt["state"];
  message?: string;
  createdAt: string;
}

export interface ProtocolTraceEntry {
  id: number;
  timestamp: string;
  direction: "sent" | "received";
  layer: string;
  appId?: number;
  emsg: number;
  name: string;
  protobuf: boolean;
  bodyBytes: number;
  bodyHex: string;
  decoded?: unknown;
  decodeError?: string;
}
