import type { OperationReceipt } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import type { StorageMutationFailure } from "./inventory-action-handlers.js";

export async function runStorageMutations(input: {
  itemIds: string[];
  mutate: (itemId: string) => Promise<OperationReceipt>;
  failureFallback: string;
  onProgress: (completed: number) => void;
  isCancelled?: () => boolean;
  intervalMs?: number;
}) {
  let completed = 0;
  const failures: StorageMutationFailure[] = [];
  for (const [index, itemId] of input.itemIds.entries()) {
    if (input.isCancelled?.())
      return { completed, failures, cancelled: true };
    await fromAppPromise(input.mutate(itemId), input.failureFallback).match(
      (receipt) => {
        if (
          receipt.state === "completed" ||
          receipt.state === "awaiting_gc_confirmation"
        ) {
          completed++;
        } else {
          failures.push({
            itemId,
            message: receipt.message ?? input.failureFallback,
          });
        }
        input.onProgress(completed);
      },
      (error) => {
        failures.push({
          itemId,
          message: appErrorMessage(error, input.failureFallback),
        });
        input.onProgress(completed);
      },
    );
    if (input.isCancelled?.())
      return { completed, failures, cancelled: true };
    if (input.intervalMs && index < input.itemIds.length - 1) {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, input.intervalMs);
      });
    }
  }
  return { completed, failures, cancelled: false };
}

export interface StorageRetrievalJob {
  unitName: string;
  itemIds: string[];
  intervalMs: number;
  mutate: (itemId: string) => Promise<OperationReceipt>;
  onProgress: (completed: number) => void;
  onFinished: (result: {
    completed: number;
    failures: StorageMutationFailure[];
    cancelled?: boolean;
  }) => void;
}

export function createStorageRetrievalQueue(input: {
  pushToast: (toast: {
    title: string;
    description?: string;
    variant?: "default" | "success" | "warning" | "danger";
    onDismiss?: () => void;
  }) => string;
  updateToast: (
    id: string,
    toast: {
      title: string;
      description?: string;
      variant?: "default" | "success" | "warning" | "danger";
      onDismiss?: () => void;
    },
  ) => void;
}) {
  const jobs: Array<StorageRetrievalJob & { cancelled: boolean }> = [];
  let active = false;
  let activeJob: (StorageRetrievalJob & { cancelled: boolean }) | undefined;
  let toastId: string | undefined;

  const cancelAll = () => {
    if (activeJob) activeJob.cancelled = true;
    for (const job of jobs) job.cancelled = true;
    jobs.length = 0;
    toastId = undefined;
  };

  const updateProgressToast = (description: string, variant?: "success" | "warning") => {
    if (!toastId) return;
    input.updateToast(toastId, {
      title: variant ? "Storage retrieval finished" : "Retrieving storage items",
      description,
      variant,
      onDismiss: cancelAll,
    });
  };

  const runJob = async (job: StorageRetrievalJob & { cancelled: boolean }) => {
    if (job.cancelled) {
      job.onFinished({ completed: 0, failures: [], cancelled: true });
      return;
    }
    const result = await runStorageMutations({
      itemIds: job.itemIds,
      mutate: job.mutate,
      failureFallback: "Failed to retrieve this item.",
      onProgress: (completed) => {
        job.onProgress(completed);
        updateProgressToast(
          `${completed} of ${job.itemIds.length} items retrieved from ${job.unitName}.`,
        );
      },
      intervalMs: job.intervalMs,
      isCancelled: () => job.cancelled,
    });
    job.onFinished(result);
    if (result.cancelled) return;
    updateProgressToast(
      `Retrieved ${result.completed} of ${job.itemIds.length} items from ${job.unitName}${result.failures.length === 0 ? "." : `; ${result.failures.length} failed.`}`,
      result.failures.length === 0 ? "success" : "warning",
    );
  };

  const enqueue = (job: StorageRetrievalJob) => {
    jobs.push({ ...job, cancelled: false });
    if (!toastId) {
      toastId = input.pushToast({
        title: "Retrieving storage items",
        description: `Queued ${job.itemIds.length} item${job.itemIds.length === 1 ? "" : "s"} from ${job.unitName}.`,
        onDismiss: cancelAll,
      });
    } else {
      updateProgressToast(`Queued another storage unit (${jobs.length} in queue).`);
    }
    if (active) return;
    active = true;
    void processQueue();
  };

  const processQueue = async () => {
    while (jobs.length > 0) {
      const job = jobs.shift();
      activeJob = job;
      if (job) await runJob(job);
      activeJob = undefined;
    }
    active = false;
  };

  return { enqueue };
}
