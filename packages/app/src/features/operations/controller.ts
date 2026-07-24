import type { OperationReceipt } from "@cs-inv-edit/contracts";
import type { ResultAsync } from "neverthrow";
import { createOperationApi } from "../../lib/api.js";
import { appErrorMessage, fromAppPromise } from "../../lib/result.js";
import type { AppBackendClient } from "../../lib/backend.js";
import type { AppError } from "../../lib/result-http.js";
import type { ToastItem } from "../../components/ui/ToastViewport.js";

export interface OperationsController {
  operationApi: ReturnType<typeof createOperationApi>;
  notifyOperationReceipt: (receipt: OperationReceipt) => void;
  settleOperation: (receiptResult: ResultAsync<OperationReceipt, AppError>, options?: { suppressToast?: boolean }) => Promise<OperationReceipt>;
}

export interface CreateOperationsControllerOptions {
  backend: AppBackendClient;
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  refreshInventory: () => ResultAsync<unknown, AppError>;
  refetchOperations: () => Promise<unknown> | unknown;
  refetchEvents: () => Promise<unknown> | unknown;
}

export function createOperationsController(options: CreateOperationsControllerOptions): OperationsController {
  const operationApi = createOperationApi(options.backend);

  const notifyOperationReceipt = (receipt: OperationReceipt) => {
    if (receipt.type === "containers.open" || receipt.type === "terminal.load-offer") {
      return;
    }
    const base = receipt.message ?? receipt.type;
    if (receipt.state === "completed") {
      options.pushToast({ title: "Operation completed", description: base, variant: "success" });
    } else if (receipt.state === "awaiting_gc_confirmation") {
      options.pushToast({ title: "Awaiting confirmation", description: base, variant: "warning" });
    } else if (receipt.state === "failed") {
      options.pushToast({ title: "Operation failed", description: base, variant: "danger" });
    } else if (receipt.state === "blocked_by_feature_flag" || receipt.state === "requires_validation") {
      options.pushToast({ title: "Operation blocked", description: base, variant: "warning" });
    } else {
      options.pushToast({ title: "Operation updated", description: base });
    }
  };

  const settleOperation = async (receiptResult: ResultAsync<OperationReceipt, AppError>, settleOptions?: { suppressToast?: boolean }): Promise<OperationReceipt> => {
    return receiptResult.andThen((receipt) => {
      console.info("[app] operation receipt", receipt);
      if (!settleOptions?.suppressToast) notifyOperationReceipt(receipt);
      if (receipt.type !== "containers.open" && (receipt.state === "completed" || receipt.state === "awaiting_gc_confirmation")) {
        return options.refreshInventory().map(() => receipt);
      }
      if (receipt.type === "containers.open") {
        return options.refreshInventory().map(() => receipt);
      }
      return fromAppPromise(Promise.resolve(receipt));
    }).andThen((receipt) => fromAppPromise(Promise.all([options.refetchOperations(), options.refetchEvents()]), "Operation state refresh failed").map(() => receipt)).match((receipt) => receipt, (error) => {
      console.error("[app] operation failed", error);
      const message = appErrorMessage(error, "Unknown operation error");
      if (!settleOptions?.suppressToast) options.pushToast({ title: "Operation error", description: message, variant: "danger" });
      return { operationId: `failed-${Date.now()}`, type: "operation.error", state: "failed", createdAt: new Date().toISOString(), message };
    });
  };

  return {
    operationApi,
    notifyOperationReceipt,
    settleOperation,
  };
}
