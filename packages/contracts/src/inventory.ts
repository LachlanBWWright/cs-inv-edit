import type {
  AppliedItem as AppliedItemDto,
  ArmoryRedeemRequest,
  ArmoryOffer as ArmoryOfferDto,
  ArmorySnapshot,
  InventoryItem as InventoryItemDto,
  InventorySnapshot,
  ItemDebug as ItemDebugDto,
  RelatedItem as RelatedItemDto,
  Sticker as StickerDto,
  StoreOffer as StoreOfferDto,
  StoreSnapshot,
  PurchaseSession,
  SteamAccountTradesCollection,
  SteamAccountTradesSnapshot,
  SteamTrade as SteamTradeDto,
  SteamTradeItem as SteamTradeItemDto,
  SteamTradeMutationResult,
  SteamTradesSnapshot,
  ConnectionStatus,
  InitializeStorePurchaseRequest,
  OperationEvent,
  OperationReceipt,
  OperationResult,
  ProtocolTraceEntry,
  TerminalOffer as TerminalOfferDto,
} from "./generated/types.gen.js";

export type {
  AppliedItemDto,
  ArmoryRedeemRequest,
  ArmoryOfferDto,
  ArmorySnapshot,
  InventoryItemDto,
  InventorySnapshot,
  ItemDebugDto,
  RelatedItemDto,
  StickerDto,
  StoreOfferDto,
  StoreSnapshot,
  PurchaseSession,
  SteamAccountTradesCollection,
  SteamAccountTradesSnapshot,
  SteamTradeDto,
  SteamTradeItemDto,
  SteamTradeMutationResult,
  SteamTradesSnapshot,
  ConnectionStatus,
  InitializeStorePurchaseRequest,
  OperationEvent,
  OperationReceipt,
  OperationResult,
  ProtocolTraceEntry,
  TerminalOfferDto,
};

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "awaiting_guard"
  | "needs_steam_guard"
  | "awaiting_qr"
  | "connected"
  | "session_conflict"
  | "error";

export type {
  PriceQuery as PriceScanRequest,
  PriceQuote as PriceQuoteDto,
  PriceResult as PriceScanResult,
} from "./generated-data/types.gen.js";

export type PurchaseSessionStatus = PurchaseSession["status"];

export interface SteamAccountProfile {
  accountName: string;
  steamId?: string;
  avatarUrl?: string;
  signedIn: boolean;
  lastSignedInAt: string;
}

export type ContainerOpenResultDto =
  | {
      kind: "inventory_award";
      openedItem: InventoryItemDto;
    }
  | {
      kind: "terminal_unsealed";
      terminalItemId: string;
    }
  | {
      kind: "terminal_offer";
      terminalItemId: string;
      offerItemId: string;
      offer: RelatedItemDto;
      pointsRemaining?: number;
    };
