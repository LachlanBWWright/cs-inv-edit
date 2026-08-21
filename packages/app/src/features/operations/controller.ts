import type { OperationReceipt } from "@cs-inv-edit/contracts";
import type { ResultAsync } from "neverthrow";
import { createOperationApi } from "../../shared/lib/api.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import type { OperationBackend } from "../../shared/lib/api.js";
import type { AppError } from "../../shared/lib/result-http.js";

export interface OperationsController {
  operationApi: ReturnType<typeof createOperationApi>;
  settleOperation: (
    receiptResult: ResultAsync<OperationReceipt, AppError>,
    options?: { suppressToast?: boolean; skipInventoryRefresh?: boolean },
  ) => Promise<OperationReceipt>;
}

export interface CreateOperationsControllerOptions {
  backend: OperationBackend;
  refreshInventory: () => ResultAsync<unknown, AppError>;
  refetchOperations: () => Promise<unknown> | unknown;
  refetchEvents: () => Promise<unknown> | unknown;
}

export function createOperationsController(
  options: CreateOperationsControllerOptions,
): OperationsController {
  const operationApi = createOperationApi(options.backend);

  const settleOperation = async (
    receiptResult: ResultAsync<OperationReceipt, AppError>,
    settleOptions?: { suppressToast?: boolean; skipInventoryRefresh?: boolean },
  ): Promise<OperationReceipt> => {
    return receiptResult
      .andThen((receipt) => {
        console.info("[app] operation receipt", receipt);
        const refreshAfterOperation = !settleOptions?.skipInventoryRefresh;
        if (receipt.type === "containers.open") {
          return options.refreshInventory().map(() => receipt);
        }
        if (
          refreshAfterOperation &&
          (receipt.state === "completed" ||
            receipt.state === "awaiting_gc_confirmation")
        ) {
          return options.refreshInventory().map(() => receipt);
        }
        return fromAppPromise(Promise.resolve(receipt));
      })
      .andThen((receipt) =>
        fromAppPromise(
          Promise.all([options.refetchOperations(), options.refetchEvents()]),
          "Operation state refresh failed",
        ).map(() => receipt),
      )
      .match(
        (receipt) => receipt,
        (error) => {
          console.error("[app] operation failed", error);
          const message = appErrorMessage(error, "Unknown operation error");
          return {
            operationId: `failed-${Date.now()}`,
            type: "operation.error",
            state: "failed",
            createdAt: new Date().toISOString(),
            message,
          };
        },
      );
  };

  return {
    operationApi,
    settleOperation,
  };
}
