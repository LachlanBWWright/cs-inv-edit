import type { HealthStatus, PriceScanRequest, PriceScanResult } from "@cs-inv-edit/contracts";
import type { ResultAsync } from "neverthrow";
import { backendSchemas } from "@cs-inv-edit/contracts";
import type { AppError } from "./result-http.js";
import { postJsonResult, requestJsonResult } from "./result-http.js";

export interface SharedDataClient {
  health(): ResultAsync<HealthStatus, AppError>;
  queryPrices(input: Pick<PriceScanRequest, "marketNames" | "currency" | "appId">): ResultAsync<PriceScanResult, AppError>;
}

export function createSharedDataClient(baseUrl: string): SharedDataClient {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return {
    health: () => requestJsonResult(normalizedBaseUrl, "/healthz", backendSchemas.health),
    queryPrices: (input) => postJsonResult(normalizedBaseUrl, "/v1/prices/query", backendSchemas.priceScan, input),
  };
}
