import type { Accessor, Setter } from "solid-js";
import type { InventoryItemDto, OperationReceipt } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import type { InventoryViewProps } from "./InventoryView.js";
import { itemDisplayName } from "./inventory-view-utils.js";

interface InventoryActionContext {
  props: InventoryViewProps;
  selectedItem: Accessor<InventoryItemDto | undefined>;
  connected: Accessor<boolean>;
  selectedToolId: Accessor<string>;
  nameTagTools: Accessor<InventoryItemDto[]>;
  draftName: Accessor<string>;
  setPending: Setter<boolean>;
  setStatusMessage: Setter<string>;
  setRenameOpen: Setter<boolean>;
  browsingStorageUnit: Accessor<InventoryItemDto | undefined>;
  storageSelectedItemIds: Accessor<string[]>;
  visibleItems: Accessor<InventoryItemDto[]>;
  setBrowsingStorageUnit: Setter<InventoryItemDto | undefined>;
  setRemoveFromStorageMode: Setter<boolean>;
  setStorageSelectedItemIds: Setter<string[]>;
  setStorageSelectionAnchorId: Setter<string | undefined>;
  setStorageRetrieval: Setter<{ completed: number; total: number } | undefined>;
  movingIntoStorageUnit: Accessor<InventoryItemDto | undefined>;
  setMovingIntoStorageUnit: Setter<InventoryItemDto | undefined>;
  setStorageFailures: Setter<StorageMutationFailure[]>;
}

export interface StorageMutationFailure {
  itemId: string;
  message: string;
}

export async function runStorageMutations(input: {
  itemIds: string[];
  mutate: (itemId: string) => Promise<OperationReceipt>;
  failureFallback: string;
  onProgress: (completed: number) => void;
}) {
  let completed = 0;
  const failures: StorageMutationFailure[] = [];
  for (const itemId of input.itemIds) {
    await fromAppPromise(
      input.mutate(itemId),
      input.failureFallback,
    ).match(
      (receipt) => {
        if (
          receipt.state === "completed" ||
          receipt.state === "awaiting_gc_confirmation"
        ) {
          completed++;
          return;
        }
        failures.push({
          itemId,
          message: receipt.message ?? input.failureFallback,
        });
      },
      (error) =>
        failures.push({
          itemId,
          message: appErrorMessage(error, input.failureFallback),
        }),
    );
    input.onProgress(completed);
  }
  return { completed, failures };
}

export function createInventoryActionHandlers(context: InventoryActionContext) {
  const {
    props,
    selectedItem,
    connected,
    selectedToolId,
    nameTagTools,
    draftName,
    setPending,
    setStatusMessage,
    setRenameOpen,
    browsingStorageUnit,
    storageSelectedItemIds,
    visibleItems,
    setBrowsingStorageUnit,
    setRemoveFromStorageMode,
    setStorageSelectedItemIds,
    setStorageSelectionAnchorId,
    setStorageRetrieval,
    movingIntoStorageUnit,
    setMovingIntoStorageUnit,
    setStorageFailures,
  } = context;
  const handleRenameSubmit = async () => {
    const item = selectedItem();
    if (!item) return;
    if (!connected()) {
      const message = "Connect to Steam before editing inventory.";
      setStatusMessage(message);
      return;
    }
    const toolId = selectedToolId() || nameTagTools()[0]?.id || "";
    if (!toolId) {
      const message = "No compatible name tag tool is currently available.";
      setStatusMessage(message);
      return;
    }
    setPending(true);
    setStatusMessage("Applying custom name...");
    await fromAppPromise(
      props.renameActions.rename({
        subjectItemId: item.id,
        toolItemId: toolId,
        name: draftName(),
      }),
      "Failed to apply custom name",
    ).match(
      () => {
        setStatusMessage("Custom name updated.");
        setRenameOpen(false);
      },
      (error) => {
        const message = appErrorMessage(error, "Failed to apply custom name.");
        setStatusMessage(message);
      },
    );
    setPending(false);
  };

  const handleRemoveName = async () => {
    const item = selectedItem();
    if (!item) return;
    if (!connected()) {
      const message = "Connect to Steam before editing inventory.";
      setStatusMessage(message);
      return;
    }
    setPending(true);
    setStatusMessage("Removing custom name...");
    await fromAppPromise(
      props.renameActions.removeName({ itemId: item.id }),
      "Failed to remove custom name",
    ).match(
      () => {
        setStatusMessage("Custom name removed.");
      },
      (error) => {
        const message = appErrorMessage(error, "Failed to remove custom name.");
        setStatusMessage(message);
      },
    );
    setPending(false);
  };

  const handleLoadStorageContents = async (casketId: string) => {
    setStorageFailures([]);
    setPending(true);
    setStatusMessage("Loading storage unit contents from CS2...");
    const loaded = await fromAppPromise(
      props.storageActions.loadContents(casketId),
      "Failed to load storage unit contents",
    ).match(
      (receipt) => {
        const accepted =
          receipt.state === "completed" ||
          receipt.state === "awaiting_gc_confirmation";
        const failureMessage =
          receipt.message ?? "CS2 did not load the storage unit contents.";
        setStatusMessage(
          accepted ? "Storage unit contents loaded." : failureMessage,
        );
        return accepted;
      },
      (error) => {
        const message = appErrorMessage(
          error,
          "Failed to load storage unit contents.",
        );
        setStatusMessage(message);
        return false;
      },
    );
    setPending(false);
    if (loaded) {
      const unit = (props.inventory?.items ?? []).find(
        (item) => item.id === casketId && item.kind === "storage_unit",
      );
      if (unit) {
        setBrowsingStorageUnit(unit);
        setRemoveFromStorageMode(false);
        setStorageSelectedItemIds([]);
        setStorageSelectionAnchorId(undefined);
        props.setSelectedItemId(undefined);
      }
    }
    return loaded;
  };

  const backFromStorage = () => {
    setBrowsingStorageUnit(undefined);
    setRemoveFromStorageMode(false);
    setStorageSelectedItemIds([]);
    setStorageSelectionAnchorId(undefined);
    setStorageFailures([]);
    props.setSelectedItemId(undefined);
  };

  const retrieveFromStorage = async (retrieveAll = false) => {
    const unit = browsingStorageUnit();
    const itemIds = retrieveAll
      ? visibleItems().map((item) => item.id)
      : storageSelectedItemIds();
    if (!unit || itemIds.length === 0) return;
    setStorageFailures([]);
    setPending(true);
    setStorageRetrieval({ completed: 0, total: itemIds.length });
    setStatusMessage(
      `Retrieving ${itemIds.length} item${itemIds.length === 1 ? "" : "s"} from ${itemDisplayName(unit)}...`,
    );
    const { completed, failures } = await runStorageMutations({
      itemIds,
      mutate: (itemId) =>
        props.storageActions.moveFrom({ casketId: unit.id, itemId }),
      failureFallback: "Failed to retrieve this item.",
      onProgress: (progress) =>
        setStorageRetrieval({ completed: progress, total: itemIds.length }),
    });
    setStorageSelectedItemIds(failures.map((failure) => failure.itemId));
    setStorageSelectionAnchorId(undefined);
    setStorageFailures(failures);
    setStatusMessage(
      `Retrieved ${completed} of ${itemIds.length} item${itemIds.length === 1 ? "" : "s"}.`,
    );
    setStorageRetrieval(undefined);
    setPending(false);
  };

  const moveIntoStorage = async () => {
    const unit = movingIntoStorageUnit();
    const itemIds = storageSelectedItemIds();
    if (!unit || itemIds.length === 0) return;
    setStorageFailures([]);
    setPending(true);
    setStorageRetrieval({ completed: 0, total: itemIds.length });
    const { completed, failures } = await runStorageMutations({
      itemIds,
      mutate: (itemId) =>
        props.storageActions.moveInto({ casketId: unit.id, itemId }),
      failureFallback: "Failed to move this item into storage.",
      onProgress: (progress) =>
        setStorageRetrieval({ completed: progress, total: itemIds.length }),
    });
    setStatusMessage(
      `Moved ${completed} of ${itemIds.length} item${itemIds.length === 1 ? "" : "s"} into ${itemDisplayName(unit)}.`,
    );
    setStorageSelectedItemIds(failures.map((failure) => failure.itemId));
    setStorageSelectionAnchorId(undefined);
    setStorageFailures(failures);
    if (failures.length === 0) setMovingIntoStorageUnit(undefined);
    setStorageRetrieval(undefined);
    setPending(false);
    props.onRefresh();
  };

  return {
    handleRenameSubmit,
    handleRemoveName,
    handleLoadStorageContents,
    backFromStorage,
    retrieveFromStorage,
    moveIntoStorage,
  };
}
