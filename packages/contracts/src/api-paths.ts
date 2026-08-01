import type {
  AcceptTradeOfferData,
  ApplyNameTagData,
  ApplyStatTrakSwapData,
  ApplyStrangePartData,
  ApplyToolToBaseItemData,
  ApplyToolToItemData,
  ConnectSteamData,
  CounterTradeOfferData,
  CreateTradeOfferData,
  DeleteItemData,
  DisconnectSteamData,
  GetArmoryData,
  GetCs2FeaturesData,
  GetGameInventoryData,
  GetHealthData,
  GetInventoryData,
  GetMarketPreviewData,
  GetProtocolTraceData,
  GetSettingsData,
  GetSteamInventoryServiceData,
  GetSteamStatusData,
  GetStoreData,
  GetStorePurchaseData,
  GetTf2FeaturesData,
  GetTf2StoreData,
  GetTradeAccountsData,
  GetTradesData,
  InitializeStorePurchaseData,
  InitializeTf2StorePurchaseData,
  ListEventsData,
  ListOperationsData,
  ListSteamInventoryServiceGamesData,
  ReconcileStorePurchaseData,
  RedeemArmoryData,
  RefreshArmoryData,
  RefreshGameInventoryData,
  RefreshInventoryData,
  RefreshSteamInventoryServiceData,
  RefreshStoreData,
  RefreshTf2StoreData,
  RefreshTradeAccountsData,
  RefreshTradesData,
  RemoveNameTagData,
  SendGiftData,
  StartSteamQrData,
  SubmitOperationData,
  SubmitSteamGuardData,
  UseItemData,
  UseMultipleItemsData,
  WatchSteamStatusData,
} from "./generated/types.gen.js";
import type {
  GetHealthData as GetDataServiceHealthData,
  GetReadinessData,
  ListProvidersData,
  QueryPricesData,
} from "./generated-data/types.gen.js";

const segment = (value: string | number) => encodeURIComponent(String(value));
const query = (value: string | number) => encodeURIComponent(String(value));

const templates = {
  acceptTradeOffer:
    "/trades/offers/{id}/accept" satisfies AcceptTradeOfferData["url"],
  applyNameTag: "/nametags/apply" satisfies ApplyNameTagData["url"],
  applyStatTrakSwap: "/stattrak/swap" satisfies ApplyStatTrakSwapData["url"],
  applyStrangePart:
    "/strange-parts/apply" satisfies ApplyStrangePartData["url"],
  applyToolToBaseItem:
    "/tools/apply-base" satisfies ApplyToolToBaseItemData["url"],
  applyToolToItem: "/tools/apply" satisfies ApplyToolToItemData["url"],
  connectSteam: "/steam/connect" satisfies ConnectSteamData["url"],
  counterTradeOffer:
    "/trades/offers/{id}/counter" satisfies CounterTradeOfferData["url"],
  createTradeOffer: "/trades/offers" satisfies CreateTradeOfferData["url"],
  deleteItem: "/items/delete" satisfies DeleteItemData["url"],
  disconnectSteam: "/steam/disconnect" satisfies DisconnectSteamData["url"],
  armory: "/armory" satisfies GetArmoryData["url"],
  cs2Features: "/games/cs2/features" satisfies GetCs2FeaturesData["url"],
  gameInventory:
    "/games/{game}/inventory" satisfies GetGameInventoryData["url"],
  health: "/health" satisfies GetHealthData["url"],
  inventory: "/inventory" satisfies GetInventoryData["url"],
  marketPreview: "/market/preview" satisfies GetMarketPreviewData["url"],
  protocolTrace: "/protocol-trace" satisfies GetProtocolTraceData["url"],
  settings: "/settings" satisfies GetSettingsData["url"],
  steamInventoryService:
    "/steam-inventory-service/{appID}" satisfies GetSteamInventoryServiceData["url"],
  steamStatus: "/steam/status" satisfies GetSteamStatusData["url"],
  store: "/store" satisfies GetStoreData["url"],
  storePurchase: "/store/purchases/{id}" satisfies GetStorePurchaseData["url"],
  tf2Features: "/games/tf2/features" satisfies GetTf2FeaturesData["url"],
  tf2Store: "/games/tf2/store" satisfies GetTf2StoreData["url"],
  tradeAccounts: "/trade-accounts" satisfies GetTradeAccountsData["url"],
  trades: "/trades" satisfies GetTradesData["url"],
  initializeStorePurchase:
    "/store/purchases" satisfies InitializeStorePurchaseData["url"],
  initializeTf2StorePurchase:
    "/games/tf2/store/purchases" satisfies InitializeTf2StorePurchaseData["url"],
  events: "/events" satisfies ListEventsData["url"],
  operations: "/operations" satisfies ListOperationsData["url"],
  steamInventoryServiceGames:
    "/steam-inventory-service/games" satisfies ListSteamInventoryServiceGamesData["url"],
  reconcileStorePurchase:
    "/store/purchases/{id}/reconcile" satisfies ReconcileStorePurchaseData["url"],
  redeemArmory: "/armory/redeem" satisfies RedeemArmoryData["url"],
  refreshArmory: "/armory/refresh" satisfies RefreshArmoryData["url"],
  refreshGameInventory:
    "/games/{game}/inventory/refresh" satisfies RefreshGameInventoryData["url"],
  refreshInventory: "/inventory/refresh" satisfies RefreshInventoryData["url"],
  refreshSteamInventoryService:
    "/steam-inventory-service/{appID}/refresh" satisfies RefreshSteamInventoryServiceData["url"],
  refreshStore: "/store/refresh" satisfies RefreshStoreData["url"],
  refreshTf2Store:
    "/games/tf2/store/refresh" satisfies RefreshTf2StoreData["url"],
  refreshTradeAccounts:
    "/trade-accounts" satisfies RefreshTradeAccountsData["url"],
  refreshTrades: "/trades/refresh" satisfies RefreshTradesData["url"],
  removeNameTag: "/nametags/remove" satisfies RemoveNameTagData["url"],
  sendGift: "/gifts/send" satisfies SendGiftData["url"],
  startSteamQr: "/steam/qr" satisfies StartSteamQrData["url"],
  submitOperation: "/operations/{type}" satisfies SubmitOperationData["url"],
  submitSteamGuard: "/steam/guard" satisfies SubmitSteamGuardData["url"],
  useItem: "/items/use" satisfies UseItemData["url"],
  useMultipleItems: "/items/use-multiple" satisfies UseMultipleItemsData["url"],
  steamStatusWebSocket:
    "/steam/status/ws" satisfies WatchSteamStatusData["url"],
} as const;

export const localAgentPaths = {
  ...templates,
  acceptTradeOffer: (id: string) => `/trades/offers/${segment(id)}/accept`,
  counterTradeOffer: (id: string) => `/trades/offers/${segment(id)}/counter`,
  gameInventory: (game: string) => `/games/${segment(game)}/inventory`,
  marketPreview: (marketName: string) =>
    `${templates.marketPreview}?marketName=${query(marketName)}`,
  protocolTrace: (after: number) =>
    `${templates.protocolTrace}?after=${query(after)}`,
  refreshGameInventory: (game: string) =>
    `/games/${segment(game)}/inventory/refresh`,
  refreshSteamInventoryService: (appID: number) =>
    `/steam-inventory-service/${segment(appID)}/refresh`,
  steamInventoryService: (appID: number) =>
    `/steam-inventory-service/${segment(appID)}`,
  storePurchase: (id: string) => `/store/purchases/${segment(id)}`,
  reconcileStorePurchase: (id: string) =>
    `/store/purchases/${segment(id)}/reconcile`,
  refreshTradeAccounts: (steamID?: string) =>
    steamID
      ? `${templates.refreshTradeAccounts}?steamId=${query(steamID)}`
      : templates.refreshTradeAccounts,
  submitOperation: (type: string) => `/operations/${segment(type)}`,
} as const;

export const dataServicePaths = {
  health: "/healthz" satisfies GetDataServiceHealthData["url"],
  readiness: "/readyz" satisfies GetReadinessData["url"],
  providers: "/v1/providers" satisfies ListProvidersData["url"],
  queryPrices: "/v1/prices/query" satisfies QueryPricesData["url"],
} as const;
