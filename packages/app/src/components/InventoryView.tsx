import { createEffect, createMemo, createSignal, on } from "solid-js";
import type {
  ConnectionStatus,
  InitializeStorePurchaseRequest,
  InventoryItemDto,
  InventorySnapshot,
  OpenContainerRequest,
  OperationReceipt,
  PriceScanResult,
  PurchaseSession,
  RelatedItemDto,
  SettingsData,
} from "@cs-inv-edit/contracts";
import { InventoryViewContent } from "./InventoryViewContent.js";
import { RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import {
  isActiveTerminal,
  isOpenableContainer,
  isTerminal,
  itemKey,
  itemKindLabel,
  itemWeaponName,
  resolveSelectedInventoryItem,
  sortInventoryItems,
  type InventorySort,
} from "./inventory-view-utils.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import type { InventoryMode } from "../view.js";
import { formatUSDMinor } from "./ItemMarketBadges.js";
import type { ReturnEstimate } from "./roi-utils.js";
import { createOpenContainerHandler } from "./inventory-open-container.js";
import { createInventoryActionHandlers } from "./inventory-action-handlers.js";
export interface InventoryViewProps {
  mode: InventoryMode;
  inventory: InventorySnapshot | undefined;
  loading?: boolean;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string | undefined) => void;
  connection: ConnectionStatus | undefined;
  settings: SettingsData | undefined;
  query: string;
  kindFilter: "all" | InventoryItemDto["kind"];
  rarityFilter: string;
  weaponFilter: string;
  collectionFilter: string;
  sort: InventorySort;
  marketPrices: ReadonlyMap<string, number>;
  compactMode: "icons" | "concise" | "detailed";
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onRename: (input: {
    subjectItemId: string;
    toolItemId: string;
    name: string;
  }) => Promise<unknown>;
  onRemoveName: (input: { itemId: string }) => Promise<unknown>;
  onOpenContainer: (
    input: OpenContainerRequest,
    suppressToast?: boolean,
  ) => Promise<unknown>;
  onTerminalPurchase: (
    input: InitializeStorePurchaseRequest,
  ) => Promise<PurchaseSession>;
  onLoadTerminalOffer: (terminalId: string) => Promise<OperationReceipt>;
  onLoadStorageContents: (casketId: string) => Promise<OperationReceipt>;
  onMoveFromStorage: (input: {
    casketId: string;
    itemId: string;
  }) => Promise<OperationReceipt>;
  onRefresh: () => void;
  onToast?: (toast: {
    title: string;
    description?: string;
    variant?: "default" | "success" | "warning" | "danger";
  }) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const mode = createMemo(() => props.mode);
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [draftName, setDraftName] = createSignal("");
  const [selectedToolId, setSelectedToolId] = createSignal("");
  const [selectedContainerKeyId, setSelectedContainerKeyId] = createSignal("");
  const [statusMessage, setStatusMessage] = createSignal("");
  const [containerStatusMessage, setContainerStatusMessage] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [reveal, setReveal] = createSignal<{
    result: RevealItem;
    ready: boolean;
    candidates: RevealItem[];
    complete: () => void;
  }>();
  const [containerReturn, setContainerReturn] = createSignal<ReturnEstimate>();
  const [containerReturnLoading, setContainerReturnLoading] =
    createSignal(false);
  const [selectedItemIds, setSelectedItemIds] = createSignal<string[]>([]);
  const [browsingStorageUnit, setBrowsingStorageUnit] =
    createSignal<InventoryItemDto>();
  const [removeFromStorageMode, setRemoveFromStorageMode] = createSignal(false);
  const [storageSelectedItemIds, setStorageSelectedItemIds] = createSignal<
    string[]
  >([]);
  const [storageSelectionAnchorId, setStorageSelectionAnchorId] =
    createSignal<string>();
  const [storageRetrieval, setStorageRetrieval] = createSignal<{
    completed: number;
    total: number;
  }>();
  const [terminalOfferRequestId, setTerminalOfferRequestId] =
    createSignal<string>();
  const [terminalOfferState, setTerminalOfferState] = createSignal<{
    terminalId: string;
    state: "loading" | "error";
    message: string;
  }>();
  const filteredItems = () => {
    const q = props.query.toLowerCase();
    const matches = (props.inventory?.items ?? []).filter((item) => {
      const searchable = [
        item.name,
        item.marketName,
        item.marketPrice,
        item.customName,
        item.kind,
        itemKindLabel(item.kind),
        item.collection,
        item.exterior,
        item.rarity,
        item.storageLocation,
        item.toolType,
        item.stickers && item.stickers.length > 0 ? "sticker" : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery = !q || searchable.includes(q);
      const matchesKind =
        props.kindFilter === "all" || item.kind === props.kindFilter;
      const matchesRarity =
        props.rarityFilter === "all" || item.rarity === props.rarityFilter;
      const matchesWeapon =
        props.weaponFilter === "all" ||
        itemWeaponName(item) === props.weaponFilter;
      const matchesCollection =
        props.collectionFilter === "all" ||
        item.collection === props.collectionFilter;
      return (
        matchesQuery &&
        matchesKind &&
        matchesRarity &&
        matchesWeapon &&
        matchesCollection
      );
    });
    return sortInventoryItems(matches, props.sort, props.marketPrices);
  };

  const visibleItems = () =>
    browsingStorageUnit()
      ? (props.inventory?.items ?? []).filter(
          (item) => item.casketId === browsingStorageUnit()!.id,
        )
      : filteredItems();
  const selectedItem = () =>
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
      props.onLoadTerminalOffer(selected.id),
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

  const selectItem = (item: InventoryItemDto, options?: { range: boolean }) => {
    if (browsingStorageUnit() && removeFromStorageMode()) {
      const anchorId = storageSelectionAnchorId();
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
          setStorageSelectedItemIds((current) => [
            ...new Set([...current, ...rangeIds]),
          ]);
          return;
        }
      }
      setStorageSelectedItemIds((current) =>
        current.includes(item.id)
          ? current.filter((id) => id !== item.id)
          : [...current, item.id],
      );
      setStorageSelectionAnchorId(item.id);
      return;
    }
    if (mode() !== "inventory") {
      setSelectedItemIds((current) =>
        current.includes(item.id)
          ? current.filter((id) => id !== item.id)
          : [...current, item.id],
      );
      props.setSelectedItemId(item.id);
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
  const connected = () => props.connection?.state === "connected";
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
    setContainerReturn,
    setContainerReturnLoading,
    setReveal,
  });
  const {
    handleRenameSubmit,
    handleRemoveName,
    handleLoadStorageContents,
    backFromStorage,
    retrieveFromStorage,
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
  });
  return (
    <>
      <InventoryViewContent
        inventory={props.inventory}
        selectionMode={mode()}
        selectedItemIds={selectedItemIds()}
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
        onMarketPreview={props.onMarketPreview}
        onScanPrices={props.onScanPrices}
        compactMode={props.compactMode}
        marketPrices={props.marketPrices}
        onSelectItem={selectItem}
        onOpenRenameEditor={openRenameEditor}
        onRenameSubmit={handleRenameSubmit}
        onRemoveName={handleRemoveName}
        onOpenContainer={handleOpenContainer}
        onTerminalPurchase={props.onTerminalPurchase}
        onLoadStorageContents={handleLoadStorageContents}
        browsingStorageUnit={browsingStorageUnit()}
        removeFromStorageMode={removeFromStorageMode()}
        storageSelectedItemIds={storageSelectedItemIds()}
        storageRetrieval={storageRetrieval()}
        onBackFromStorage={backFromStorage}
        onToggleRemoveFromStorageMode={() => {
          setRemoveFromStorageMode((current) => !current);
          setStorageSelectedItemIds([]);
          setStorageSelectionAnchorId(undefined);
        }}
        onRetrieveFromStorage={() => retrieveFromStorage(false)}
        onRetrieveAllFromStorage={() => retrieveFromStorage(true)}
        onCloseRename={() => setRenameOpen(false)}
        onDraftNameChange={setDraftName}
        onSelectedToolChange={setSelectedToolId}
        onSelectedContainerKeyChange={setSelectedContainerKeyId}
        onRefresh={props.onRefresh}
      />
      <RevealAnimation
        open={!!reveal()}
        ready={reveal()?.ready}
        mode={
          isTerminal(selectedItem())
            ? (props.settings?.animations?.terminal ?? "slot-machine")
            : (props.settings?.animations?.container ?? "slot-machine")
        }
        title={
          isTerminal(selectedItem()) ? "Terminal offer" : "Container opening"
        }
        candidates={reveal()?.candidates ?? []}
        result={reveal()?.result ?? { name: "Item" }}
        returnEstimate={containerReturn()}
        returnEstimateLoading={containerReturnLoading()}
        returnEstimateCostLabel="Container + key"
        returnEstimateNote="Expected value uses schema odds and current market prices; Steam fees are excluded."
        onComplete={() => {
          const current = reveal();
          setReveal(undefined);
          current?.complete();
        }}
      />
    </>
  );
}
