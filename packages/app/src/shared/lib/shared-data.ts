import type {
  DataServiceHealth,
  PriceScanRequest,
  PriceScanResult,
  PriceHistoryResult,
  PriceSearchResult,
} from "@cs-inv-edit/contracts";
import type { ResultAsync } from "neverthrow";
import { backendSchemas, dataServicePaths } from "@cs-inv-edit/contracts";
import type { AppError } from "./result-http.js";
import { postJsonResult, requestJsonResult } from "./result-http.js";

export interface SharedDataClient {
  health(): ResultAsync<DataServiceHealth, AppError>;
  queryPrices(
    input: Pick<PriceScanRequest, "marketNames" | "currency" | "appId">,
  ): ResultAsync<PriceScanResult, AppError>;
  priceHistory(
    marketName: string,
    currency: string,
    appId?: number,
  ): ResultAsync<PriceHistoryResult, AppError>;
  searchPrices(
    query: string,
    appId?: number,
  ): ResultAsync<PriceSearchResult, AppError>;
}

export function createSharedDataClient(baseUrl: string): SharedDataClient {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return {
    health: () =>
      requestJsonResult(
        normalizedBaseUrl,
        dataServicePaths.health,
        backendSchemas.dataServiceHealth,
      ),
    queryPrices: (input) =>
      postJsonResult(
        normalizedBaseUrl,
        dataServicePaths.queryPrices,
        backendSchemas.priceScan,
        input,
      ),
    priceHistory: (marketName, currency, appId = 730) =>
      requestJsonResult(
        normalizedBaseUrl,
        dataServicePaths.priceHistory(marketName, currency, appId),
        backendSchemas.priceHistory,
      ),
    searchPrices: (query, appId = 730) =>
      requestJsonResult(
        normalizedBaseUrl,
        dataServicePaths.searchPrices(query, appId),
        backendSchemas.priceSearch,
      ),
  };
}
