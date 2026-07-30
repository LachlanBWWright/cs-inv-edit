import type { Accessor, Setter } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
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
}

export function createInventoryActionHandlers(context: InventoryActionContext) {
  const { props, selectedItem, connected, selectedToolId, nameTagTools, draftName, setPending, setStatusMessage, setRenameOpen, browsingStorageUnit, storageSelectedItemIds, visibleItems, setBrowsingStorageUnit, setRemoveFromStorageMode, setStorageSelectedItemIds, setStorageSelectionAnchorId, setStorageRetrieval } = context;
  const handleRenameSubmit = async () => {
    const item = selectedItem();
    if (!item) return;
    if (!connected()) {
      const message = "Connect to Steam before editing inventory.";
      setStatusMessage(message);
      props.onToast?.({
        title: "Account required",
        description: message,
        variant: "warning",
      });
      return;
    }
    const toolId = selectedToolId() || nameTagTools()[0]?.id || "";
    if (!toolId) {
      const message = "No compatible name tag tool is currently available.";
      setStatusMessage(message);
      props.onToast?.({
        title: "No tool available",
        description: message,
        variant: "warning",
      });
      return;
    }
    setPending(true);
    setStatusMessage("Applying custom name...");
    await fromAppPromise(
      props.onRename({
        subjectItemId: item.id,
        toolItemId: toolId,
        name: draftName(),
      }),
      "Failed to apply custom name",
    ).match(
      () => {
        setStatusMessage("Custom name updated.");
        setRenameOpen(false);
        props.onToast?.({
          title: "Custom name applied",
          description: `${item.name} now has a custom label.`,
          variant: "success",
        });
      },
      (error) => {
        const message = appErrorMessage(error, "Failed to apply custom name.");
        setStatusMessage(message);
        props.onToast?.({
          title: "Rename failed",
          description: message,
          variant: "danger",
        });
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
      props.onToast?.({
        title: "Account required",
        description: message,
        variant: "warning",
      });
      return;
    }
    setPending(true);
    setStatusMessage("Removing custom name...");
    await fromAppPromise(
      props.onRemoveName({ itemId: item.id }),
      "Failed to remove custom name",
    ).match(
      () => {
        setStatusMessage("Custom name removed.");
        props.onToast?.({
          title: "Custom name removed",
          description: `${item.name} is back to its original label.`,
          variant: "success",
        });
      },
      (error) => {
        const message = appErrorMessage(error, "Failed to remove custom name.");
        setStatusMessage(message);
        props.onToast?.({
          title: "Remove-name failed",
          description: message,
          variant: "danger",
        });
      },
    );
    setPending(false);
  };

  const handleLoadStorageContents = async (casketId: string) => {
    setPending(true);
    setStatusMessage("Loading storage unit contents from CS2...");
    const loaded = await fromAppPromise(
      props.onLoadStorageContents(casketId),
      "Failed to load storage unit contents",
    ).match(
      (receipt) => {
        const accepted =
          receipt.state === "completed" ||
          receipt.state === "awaiting_gc_confirmation";
        setStatusMessage(
          accepted
            ? "Storage unit contents loaded."
            : (receipt.message ??
                "CS2 did not load the storage unit contents."),
        );
        return accepted;
      },
      (error) => {
        const message = appErrorMessage(
          error,
          "Failed to load storage unit contents.",
        );
        setStatusMessage(message);
        props.onToast?.({
          title: "Storage load failed",
          description: message,
          variant: "danger",
        });
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
    props.setSelectedItemId(undefined);
  };

  const retrieveFromStorage = async (retrieveAll = false) => {
    const unit = browsingStorageUnit();
    const itemIds = retrieveAll
      ? visibleItems().map((item) => item.id)
      : storageSelectedItemIds();
    if (!unit || itemIds.length === 0) return;
    setPending(true);
    setStorageRetrieval({ completed: 0, total: itemIds.length });
    setStatusMessage(
      `Retrieving ${itemIds.length} item${itemIds.length === 1 ? "" : "s"} from ${itemDisplayName(unit)}...`,
    );
    let completed = 0;
    for (const itemId of itemIds) {
      await fromAppPromise(
        props.onMoveFromStorage({ casketId: unit.id, itemId }),
        "Failed to retrieve item from storage",
      ).match(
        (receipt) => {
          if (
            receipt.state === "completed" ||
            receipt.state === "awaiting_gc_confirmation"
          )
            completed++;
        },
        () => undefined,
      );
      setStorageRetrieval({ completed, total: itemIds.length });
    }
    setStorageSelectedItemIds([]);
    setStorageSelectionAnchorId(undefined);
    setStatusMessage(
      `Retrieved ${completed} of ${itemIds.length} item${itemIds.length === 1 ? "" : "s"}.`,
    );
    setStorageRetrieval(undefined);
    setPending(false);
  };

  return { handleRenameSubmit, handleRemoveName, handleLoadStorageContents, backFromStorage, retrieveFromStorage };
}
