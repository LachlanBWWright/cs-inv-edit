import { createEffect, createSignal, on } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { InventoryViewContent } from "./InventoryViewContent.js";
import {
  isActiveTerminal,
  isOpenableContainer,
  itemKey,
  resolveSelectedInventoryItem,
} from "./inventory-view-utils.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import { formatUSDMinor } from "./ItemMarketBadges.js";
import { createOpenContainerHandler } from "./inventory-open-container.js";
import { createInventoryActionHandlers } from "./inventory-action-handlers.js";
import type { StorageMutationFailure } from "./inventory-action-handlers.js";
import { filterInventoryItems } from "./inventory-filtering.js";
import type { InventoryViewProps } from "./inventory-view-props.js";
import {
  storageMoveCandidates,
  storageSelectionLimit,
} from "./inventory-storage-selection.js";
import { createInventoryTradeUp } from "./inventory-trade-up.js";
import { TradeUpConfirmationDialog } from "./TradeUpConfirmationDialog.js";
import {
  InventoryReveal,
  type InventoryRevealState,
} from "./InventoryReveal.js";
export type { InventoryViewProps } from "./inventory-view-props.js";

export function InventoryView(props: InventoryViewProps) {
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [draftName, setDraftName] = createSignal("");
  const [selectedToolId, setSelectedToolId] = createSignal("");
  const [selectedContainerKeyId, setSelectedContainerKeyId] = createSignal("");
  const [statusMessage, setStatusMessage] = createSignal("");
  const [containerStatusMessage, setContainerStatusMessage] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [reveal, setReveal] = createSignal<InventoryRevealState>();
  const [selectedItemIds, setSelectedItemIds] = createSignal<string[]>([]);
  const [browsingStorageUnit, setBrowsingStorageUnit] =
    createSignal<InventoryItemDto>();
  const [removeFromStorageMode, setRemoveFromStorageMode] = createSignal(false);
  const [movingIntoStorageUnit, setMovingIntoStorageUnit] =
    createSignal<InventoryItemDto>();
  const [storageSelectedItemIds, setStorageSelectedItemIds] = createSignal<
    string[]
  >([]);
  const [storageSelectionAnchorId, setStorageSelectionAnchorId] =
    createSignal<string>();
  const [storageRetrieval, setStorageRetrieval] = createSignal<{
    completed: number;
    total: number;
  }>();
  const [storageFailures, setStorageFailures] = createSignal<
    StorageMutationFailure[]
  >([]);
  const [terminalOfferRequestId, setTerminalOfferRequestId] =
    createSignal<string>();
  const [terminalOfferState, setTerminalOfferState] = createSignal<{
    terminalId: string;
    state: import("../../shared/ui-types.js").LoadingState;
    message: string;
  }>();
  const tradeUp = createInventoryTradeUp(() => props.inventory?.items ?? []);
  const filteredItems = () => {
    return filterInventoryItems({
      items: props.inventory?.items ?? [],
      query: props.query,
      kind: props.kindFilter,
      rarity: props.rarityFilter,
      weapon: props.weaponFilter,
      collection: props.collectionFilter,
      sort: props.sort,
      marketPrices: props.marketPrices,
    });
  };

  const visibleItems = () =>
    browsingStorageUnit()
      ? (props.inventory?.items ?? []).filter(
          (item) => item.casketId === browsingStorageUnit()!.id,
        )
      : movingIntoStorageUnit()
        ? storageMoveCandidates(filteredItems(), movingIntoStorageUnit()!)
        : tradeUp.filterItems(filteredItems());
  const selectedItem = () =>
    movingIntoStorageUnit() ??
    resolveSelectedInventoryItem(visibleItems(), props.selectedItemId);
  createEffect(() => {
    const selected = selectedItem();
    if (!selected || !isActiveTerminal(selected)) {
      setTerminalOfferRequestId(undefined);
      setTerminalOfferState(undefined);
      return;
    }
    if (terminalOfferRequestId() === selected.id) return;
    setTerminalOfferRequestId(selected.id);
    setTerminalOfferState({
      terminalId: selected.id,
      state: "loading",
      message: "Loading the current offer from CS2…",
    });
    void fromAppPromise(
      props.containerActions.loadTerminalOffer(selected.id),
      "Failed to load terminal offer",
    ).match(
      (receipt) => {
        if (receipt.state === "completed") {
          setTerminalOfferState(undefined);
        } else {
          setTerminalOfferState({
            terminalId: selected.id,
            state: "error",
            message:
              receipt.message ??
              "CS2 did not confirm the current terminal offer.",
          });
        }
      },
      (error) => {
        const message = appErrorMessage(
          error,
          "Failed to load terminal offer.",
        );
        setTerminalOfferState({
          terminalId: selected.id,
          state: "error",
          message,
        });
      },
    );
  });
  const selectedItemWithPrice = () => {
    const item = selectedItem();
    if (!item) return undefined;
    const amount = props.marketPrices.get(item.marketName ?? "");
    return {
      ...item,
      marketPrice:
        item.marketPrice ||
        (amount !== undefined && amount > 0
          ? formatUSDMinor(amount)
          : undefined),
    };
  };

  const selectedItemKey = () => {
    const selected = selectedItem();
    if (!selected) return undefined;
    const index = filteredItems().indexOf(selected);
    return itemKey(selected, index);
  };

  const selectItem = (
    item: InventoryItemDto,
    options?: { range: boolean; selected?: boolean },
  ) => {
    if (tradeUp.active()) {
      tradeUp.toggle(item);
      return;
    }
    if (
      movingIntoStorageUnit() ||
      (browsingStorageUnit() && removeFromStorageMode())
    ) {
      setStorageFailures([]);
      const anchorId = storageSelectionAnchorId();
      const selectionLimit = movingIntoStorageUnit()
        ? storageSelectionLimit(movingIntoStorageUnit()!)
        : Number.POSITIVE_INFINITY;
      if (options?.range && anchorId) {
        const items = visibleItems();
        const anchorIndex = items.findIndex(
          (candidate) => candidate.id === anchorId,
        );
        const itemIndex = items.findIndex(
          (candidate) => candidate.id === item.id,
        );
        if (anchorIndex >= 0 && itemIndex >= 0) {
          const start = Math.min(anchorIndex, itemIndex);
          const end = Math.max(anchorIndex, itemIndex);
          const rangeIds = items
            .slice(start, end + 1)
            .map((candidate) => candidate.id);
          setStorageSelectedItemIds((current) =>
            [...new Set([...current, ...rangeIds])].slice(0, selectionLimit),
          );
          return;
        }
      }
      setStorageSelectedItemIds((current) => {
        const currentlySelected = current.includes(item.id);
        const shouldSelect = options?.selected ?? !currentlySelected;
        if (!shouldSelect) return current.filter((id) => id !== item.id);
        if (currentlySelected) return current;
        if (current.length >= selectionLimit) {
          setStatusMessage(
            `This unit only has ${selectionLimit} available slot${selectionLimit === 1 ? "" : "s"}.`,
          );
          return current;
        }
        return [...current, item.id];
      });
      setStorageSelectionAnchorId(item.id);
      return;
    }
    setSelectedItemIds([]);
    props.setSelectedItemId(item.id);
  };

  const nameTagTools = () =>
    (props.inventory?.items ?? []).filter((item) => item.isNameTagTool);
  const compatibleContainerKeys = () => {
    const required = selectedItem()?.requiredKeyDefIndexes ?? [];
    return (props.inventory?.items ?? []).filter(
      (item) => item.defindex !== undefined && required.includes(item.defindex),
    );
  };
  const compatibleContainerKey = () =>
    compatibleContainerKeys().find(
      (item) => item.id === selectedContainerKeyId(),
    );
  createEffect(
    on(
      () => selectedItem()?.id,
      () => setSelectedContainerKeyId(""),
    ),
  );
  const connected = () =>
    props.connection?.state === "connected" ||
    props.connection?.state === "session_conflict";
  const inventoryError = () =>
    props.inventory?.error || props.inventory?.message;
  const inventoryDiagnostics = () => props.inventory?.diagnostics ?? [];
  const inventoryLoading = () =>
    !!props.loading ||
    props.inventory?.status === "loading" ||
    (connected() && props.inventory?.status === "requires_connection");

  const openRenameEditor = (item: InventoryItemDto) => {
    setDraftName(item.customName || item.name);
    const firstTool = nameTagTools()[0]?.id;
    setSelectedToolId(firstTool ?? "");
    setRenameOpen(true);
    props.setSelectedItemId(item.id);
  };

  const handleOpenContainer = createOpenContainerHandler({
    props,
    selectedItem,
    compatibleContainerKey,
    compatibleContainerKeys,
    connected,
    setContainerStatusMessage,
    setPending,
    setReveal,
  });
  const {
    handleRenameSubmit,
    handleRemoveName,
    handleLoadStorageContents,
    backFromStorage,
    retrieveFromStorage,
    moveIntoStorage,
  } = createInventoryActionHandlers({
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
  });
  return (
    <>
      <InventoryViewContent
        inventory={props.inventory}
        selectionMode="inventory"
        selectedItemIds={
          tradeUp.active() ? tradeUp.selectedIds() : selectedItemIds()
        }
        connection={props.connection}
        settings={props.settings}
        filteredItems={visibleItems()}
        selectedItem={selectedItemWithPrice()}
        selectedItemExplicit={!!props.selectedItemId}
        selectedItemKey={selectedItemKey()}
        statusMessage={statusMessage()}
        terminalOfferState={terminalOfferState()}
        containerStatusMessage={containerStatusMessage()}
        renameOpen={renameOpen()}
        draftName={draftName()}
        selectedToolId={selectedToolId()}
        pending={pending()}
        inventoryError={inventoryError() ?? ""}
        inventoryDiagnostics={inventoryDiagnostics()}
        inventoryLoading={inventoryLoading()}
        connected={connected()}
        nameTagTools={nameTagTools()}
        compatibleContainerKey={compatibleContainerKey()}
        compatibleContainerKeys={compatibleContainerKeys()}
        selectedContainerKeyId={selectedContainerKeyId()}
        canOpenContainer={isOpenableContainer(selectedItem())}
        canUseNameTagOn={
          selectedItem()?.kind === "weapon_skin" && nameTagTools().length > 0
        }
        onMarketPreview={props.marketActions.preview}
        onScanPrices={props.marketActions.scanPrices}
        compactMode={props.compactMode}
        marketPrices={props.marketPrices}
        onSelectItem={selectItem}
        onOpenRenameEditor={openRenameEditor}
        onRenameSubmit={handleRenameSubmit}
        onRemoveName={handleRemoveName}
        onOpenContainer={handleOpenContainer}
        onTerminalPurchase={props.containerActions.purchaseTerminal}
        onLoadStorageContents={handleLoadStorageContents}
        onBeginMoveIntoStorage={(unit) => {
          setMovingIntoStorageUnit(unit);
          setStorageSelectedItemIds([]);
          setStorageSelectionAnchorId(undefined);
          setStorageFailures([]);
        }}
        movingIntoStorageUnit={movingIntoStorageUnit()}
        browsingStorageUnit={browsingStorageUnit()}
        removeFromStorageMode={removeFromStorageMode()}
        storageSelectedItemIds={storageSelectedItemIds()}
        storageRetrieval={storageRetrieval()}
        storageFailures={storageFailures()}
        onBackFromStorage={backFromStorage}
        onToggleRemoveFromStorageMode={() => {
          setRemoveFromStorageMode((current) => !current);
          setStorageSelectedItemIds([]);
          setStorageSelectionAnchorId(undefined);
          setStorageFailures([]);
        }}
        onRetrieveFromStorage={() => retrieveFromStorage(false)}
        onRetrieveAllFromStorage={() => retrieveFromStorage(true)}
        onCancelMoveIntoStorage={() => {
          setMovingIntoStorageUnit(undefined);
          setStorageSelectedItemIds([]);
          setStorageSelectionAnchorId(undefined);
          setStorageFailures([]);
        }}
        onConfirmMoveIntoStorage={moveIntoStorage}
        tradeUpActive={tradeUp.active()}
        tradeUpSelectedCount={tradeUp.selectedItems().length}
        tradeUpRequiredCount={tradeUp.requiredCount()}
        onStartTradeUp={() => {
          props.setSelectedItemId(undefined);
          tradeUp.start();
        }}
        onCancelTradeUp={tradeUp.reset}
        onReviewTradeUp={() => tradeUp.setConfirmationOpen(true)}
        onCloseRename={() => setRenameOpen(false)}
        onDraftNameChange={setDraftName}
        onSelectedToolChange={setSelectedToolId}
        onSelectedContainerKeyChange={setSelectedContainerKeyId}
        onRefresh={props.onRefresh}
      />
      <TradeUpConfirmationDialog
        open={tradeUp.confirmationOpen()}
        items={tradeUp.selectedItems()}
        outcomes={tradeUp.outcomes()}
        executionEnabled={props.settings?.featureFlags.enableTradeups ?? false}
        connected={connected()}
        requiredCount={tradeUp.requiredCount()}
        marketPrices={props.marketPrices}
        scanPrices={props.marketActions.scanPrices}
        onOpenChange={tradeUp.setConfirmationOpen}
        onRemove={tradeUp.toggle}
        onExecute={props.tradeUpActions.execute}
        onAccepted={() => {
          tradeUp.reset();
          props.onRefresh();
        }}
      />
      <InventoryReveal
        reveal={reveal()}
        selectedItem={selectedItem()}
        settings={props.settings}
        onDismiss={() => {
          const current = reveal();
          setReveal(undefined);
          current?.complete();
        }}
      />
    </>
  );
}
