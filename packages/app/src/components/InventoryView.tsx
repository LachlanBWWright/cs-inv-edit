import { createEffect, createMemo, createSignal, on } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, OpenContainerRequest, OperationReceipt, RelatedItemDto, SettingsData } from "@cs-inv-edit/contracts";
import { InventoryViewContent } from "./InventoryViewContent.js";
import { RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import { isOpenableContainer, itemDisplayName, itemKey, itemKindLabel, itemWeaponName, resolveSelectedInventoryItem, sortInventoryItems, type InventorySort } from "./inventory-view-utils.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import type { InventoryMode } from "../view.js";

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
  onRename: (input: { subjectItemId: string; toolItemId: string; name: string }) => Promise<unknown>;
  onRemoveName: (input: { itemId: string }) => Promise<unknown>;
  onOpenContainer: (input: OpenContainerRequest) => Promise<unknown>;
  onLoadStorageContents: (casketId: string) => Promise<OperationReceipt>;
  onMoveFromStorage: (input: { casketId: string; itemId: string }) => Promise<OperationReceipt>;
  onRefresh: () => void;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
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
  const [reveal, setReveal] = createSignal<{ result: RevealItem; ready: boolean; candidates: RevealItem[]; complete: () => void }>();
  const [selectedItemIds, setSelectedItemIds] = createSignal<string[]>([]);
  const [browsingStorageUnit, setBrowsingStorageUnit] = createSignal<InventoryItemDto>();
  const [removeFromStorageMode, setRemoveFromStorageMode] = createSignal(false);
  const [storageSelectedItemIds, setStorageSelectedItemIds] = createSignal<string[]>([]);
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
      const matchesKind = props.kindFilter === "all" || item.kind === props.kindFilter;
      const matchesRarity = props.rarityFilter === "all" || item.rarity === props.rarityFilter;
      const matchesWeapon = props.weaponFilter === "all" || itemWeaponName(item) === props.weaponFilter;
      const matchesCollection = props.collectionFilter === "all" || item.collection === props.collectionFilter;
      return matchesQuery && matchesKind && matchesRarity && matchesWeapon && matchesCollection;
    });
    return sortInventoryItems(matches, props.sort, props.marketPrices);
  };

  const visibleItems = () => browsingStorageUnit()
    ? (props.inventory?.items ?? []).filter((item) => item.casketId === browsingStorageUnit()!.id)
    : filteredItems();
  const selectedItem = () => resolveSelectedInventoryItem(visibleItems(), props.selectedItemId);

  const selectedItemKey = () => {
    const selected = selectedItem();
    if (!selected) return undefined;
    const index = filteredItems().indexOf(selected);
    return itemKey(selected, index);
  };

  const selectItem = (item: InventoryItemDto) => {
	if (browsingStorageUnit() && removeFromStorageMode()) {
		setStorageSelectedItemIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
		return;
	}
	if (mode() !== "inventory") {
		setSelectedItemIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
		props.setSelectedItemId(item.id);
		return;
	}
	setSelectedItemIds([]);
    props.setSelectedItemId(item.id);
  };

  const nameTagTools = () => (props.inventory?.items ?? []).filter((item) => item.isNameTagTool);
  const compatibleContainerKeys = () => {
    const required = selectedItem()?.requiredKeyDefIndexes ?? [];
    return (props.inventory?.items ?? []).filter((item) => item.defindex !== undefined && required.includes(item.defindex));
  };
  const compatibleContainerKey = () => compatibleContainerKeys().find((item) => item.id === selectedContainerKeyId());
  createEffect(on(() => selectedItem()?.id, () => setSelectedContainerKeyId("")));
  const connected = () => props.connection?.state === "connected";
  const inventoryError = () => props.inventory?.error || props.inventory?.message;
  const inventoryDiagnostics = () => props.inventory?.diagnostics ?? [];
  const inventoryLoading = () => !!props.loading || props.inventory?.status === "loading" || (connected() && props.inventory?.status === "requires_connection");

  const openRenameEditor = (item: InventoryItemDto) => {
    setDraftName(item.customName || item.name);
    const firstTool = nameTagTools()[0]?.id;
    setSelectedToolId(firstTool ?? "");
    setRenameOpen(true);
    props.setSelectedItemId(item.id);
  };

  const handleRenameSubmit = async () => {
    const item = selectedItem();
    if (!item) return;
    if (!connected()) {
      const message = "Connect to Steam before editing inventory.";
      setStatusMessage(message);
      props.onToast?.({ title: "Account required", description: message, variant: "warning" });
      return;
    }
    const toolId = selectedToolId() || nameTagTools()[0]?.id || "";
    if (!toolId) {
      const message = "No compatible name tag tool is currently available.";
      setStatusMessage(message);
      props.onToast?.({ title: "No tool available", description: message, variant: "warning" });
      return;
    }
    setPending(true);
    setStatusMessage("Applying custom name...");
    await fromAppPromise(props.onRename({ subjectItemId: item.id, toolItemId: toolId, name: draftName() }), "Failed to apply custom name").match(() => {
      setStatusMessage("Custom name updated.");
      setRenameOpen(false);
      props.onToast?.({ title: "Custom name applied", description: `${item.name} now has a custom label.`, variant: "success" });
    }, (error) => {
      const message = appErrorMessage(error, "Failed to apply custom name.");
      setStatusMessage(message);
      props.onToast?.({ title: "Rename failed", description: message, variant: "danger" });
    });
    setPending(false);
  };

  const handleRemoveName = async () => {
    const item = selectedItem();
    if (!item) return;
    if (!connected()) {
      const message = "Connect to Steam before editing inventory.";
      setStatusMessage(message);
      props.onToast?.({ title: "Account required", description: message, variant: "warning" });
      return;
    }
    setPending(true);
    setStatusMessage("Removing custom name...");
    await fromAppPromise(props.onRemoveName({ itemId: item.id }), "Failed to remove custom name").match(() => {
      setStatusMessage("Custom name removed.");
      props.onToast?.({ title: "Custom name removed", description: `${item.name} is back to its original label.`, variant: "success" });
    }, (error) => {
      const message = appErrorMessage(error, "Failed to remove custom name.");
      setStatusMessage(message);
      props.onToast?.({ title: "Remove-name failed", description: message, variant: "danger" });
    });
    setPending(false);
  };

  const handleOpenContainer = async () => {
    const item = selectedItem();
    if (!item) return;
    if (!connected()) {
      const message = "Connect to Steam before opening containers.";
      setContainerStatusMessage(message);
      return;
    }
    if (!isOpenableContainer(item)) {
      const message = "Selected item is not a container or capsule.";
      setContainerStatusMessage(message);
      return;
    }
    if ((item.requiredKeyDefIndexes?.length ?? 0) > 0 && !compatibleContainerKey()) {
      setContainerStatusMessage(compatibleContainerKeys().length > 0 ? "Select a compatible key before opening this container." : "This container requires a compatible key, but none is present in your inventory.");
      return;
    }
    setPending(true);
    setContainerStatusMessage("Sending open request to CS2...");
    const keyItemId = compatibleContainerKey()?.id;
    const isWeaponCase = /\bcase\b/i.test(`${item.name} ${item.marketName ?? ""}`) && !item.isSouvenir;
    const isSouvenirPackage = /souvenir.*package|package.*souvenir/i.test(`${item.name} ${item.marketName ?? ""}`);
    const candidates = (item.containerItems ?? []).map((candidate) => ({ name: candidate.marketName || candidate.name, imageUrl: candidate.imageUrl, rarity: candidate.rarity, kind: candidate.kind, wear: candidate.paintWear, wearMin: candidate.wearMin, wearMax: candidate.wearMax, supportsStatTrak: isWeaponCase && candidate.kind === "weapon_skin", supportsSouvenir: isSouvenirPackage && candidate.kind === "weapon_skin" }));
    const animationMode = props.settings?.animations?.container ?? "slot-machine";
    if (animationMode !== "none") setReveal({ result: candidates[0] ?? { name: "Awaiting item…" }, ready: false, candidates, complete: () => undefined });
    await fromAppPromise(props.onOpenContainer({ itemId: item.id, ...(keyItemId ? { keyItemId } : {}) }), "Failed to open container").match(async (receipt) => {
      if (typeof receipt === "object" && receipt && "state" in receipt && receipt.state !== "completed" && receipt.state !== "awaiting_gc_confirmation") {
        const message = "message" in receipt && typeof receipt.message === "string" ? receipt.message : "Container open request was not accepted.";
        const responseBody =
        "result" in receipt && typeof receipt.result === "object" && receipt.result && "responseBodyHex" in receipt.result && typeof receipt.result.responseBodyHex === "string"
        ? ` Response body: ${receipt.result.responseBodyHex}`
        : "";
        setContainerStatusMessage(`${message}${responseBody}`);
      } else {
        const openedItem =
        typeof receipt === "object" && receipt && "result" in receipt && typeof receipt.result === "object" && receipt.result && "openedItem" in receipt.result
        ? (receipt.result.openedItem as InventoryItemDto | undefined)
        : undefined;
        const message = openedItem
        ? `Received ${itemDisplayName(openedItem)}.`
        : typeof receipt === "object" && receipt && "message" in receipt && typeof receipt.message === "string"
        ? receipt.message
        : "Container opened and inventory was reconciled.";
        if (openedItem) {
          const result = { name: itemDisplayName(openedItem), imageUrl: openedItem.imageUrl, rarity: openedItem.rarity, kind: openedItem.kind, wear: openedItem.paintWear, wearMin: openedItem.paintWearMin, wearMax: openedItem.paintWearMax, isStatTrak: openedItem.isStatTrak, isSouvenir: openedItem.isSouvenir };
          if (animationMode !== "none") {
            await new Promise<void>((resolve) => setReveal({ result, ready: true, candidates, complete: resolve }));
          }
        } else {
          setReveal(undefined);
        }
        setContainerStatusMessage(message);
        if (openedItem?.id) {
        props.setSelectedItemId(openedItem.id);
        }
      }
    }, (error) => {
      setReveal(undefined);
      setContainerStatusMessage(appErrorMessage(error, "Failed to open container."));
    });
    setPending(false);
  };

  const handleLoadStorageContents = async (casketId: string) => {
    setPending(true);
    setStatusMessage("Loading storage unit contents from CS2...");
    const loaded = await fromAppPromise(props.onLoadStorageContents(casketId), "Failed to load storage unit contents").match((receipt) => {
      const accepted = receipt.state === "completed" || receipt.state === "awaiting_gc_confirmation";
      setStatusMessage(accepted ? "Storage unit contents loaded." : receipt.message ?? "CS2 did not load the storage unit contents.");
      return accepted;
    }, (error) => {
      const message = appErrorMessage(error, "Failed to load storage unit contents.");
      setStatusMessage(message);
      props.onToast?.({ title: "Storage load failed", description: message, variant: "danger" });
      return false;
    });
    setPending(false);
    if (loaded) {
      const unit = (props.inventory?.items ?? []).find((item) => item.id === casketId && item.kind === "storage_unit");
      if (unit) {
        setBrowsingStorageUnit(unit);
        setRemoveFromStorageMode(false);
        setStorageSelectedItemIds([]);
        props.setSelectedItemId(undefined);
      }
    }
    return loaded;
  };

  const backFromStorage = () => {
    setBrowsingStorageUnit(undefined);
    setRemoveFromStorageMode(false);
    setStorageSelectedItemIds([]);
    props.setSelectedItemId(undefined);
  };

  const retrieveFromStorage = async () => {
    const unit = browsingStorageUnit();
    const itemIds = storageSelectedItemIds();
    if (!unit || itemIds.length === 0) return;
    setPending(true);
    setStatusMessage(`Retrieving ${itemIds.length} item${itemIds.length === 1 ? "" : "s"} from ${itemDisplayName(unit)}...`);
    let completed = 0;
    for (const itemId of itemIds) {
      const receipt = await props.onMoveFromStorage({ casketId: unit.id, itemId });
      if (receipt.state === "completed" || receipt.state === "awaiting_gc_confirmation") completed++;
    }
    setStorageSelectedItemIds([]);
    setStatusMessage(`Retrieved ${completed} of ${itemIds.length} selected item${itemIds.length === 1 ? "" : "s"}.`);
    setPending(false);
  };

  return (<>
    <InventoryViewContent
      inventory={props.inventory}
      selectionMode={mode()}
	  selectedItemIds={selectedItemIds()}
      connection={props.connection}
      settings={props.settings}
      filteredItems={visibleItems()}
      selectedItem={selectedItem()}
      selectedItemKey={selectedItemKey()}
      statusMessage={statusMessage()}
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
      canUseNameTagOn={selectedItem()?.kind === "weapon_skin" && nameTagTools().length > 0}
      onMarketPreview={props.onMarketPreview}
      compactMode={props.compactMode}
      onSelectItem={selectItem}
      onOpenRenameEditor={openRenameEditor}
      onRenameSubmit={handleRenameSubmit}
      onRemoveName={handleRemoveName}
      onOpenContainer={handleOpenContainer}
      onLoadStorageContents={handleLoadStorageContents}
      browsingStorageUnit={browsingStorageUnit()}
      removeFromStorageMode={removeFromStorageMode()}
      storageSelectedItemIds={storageSelectedItemIds()}
      onBackFromStorage={backFromStorage}
      onToggleRemoveFromStorageMode={() => { setRemoveFromStorageMode((current) => !current); setStorageSelectedItemIds([]); }}
      onRetrieveFromStorage={retrieveFromStorage}
      onCloseRename={() => setRenameOpen(false)}
      onDraftNameChange={setDraftName}
      onSelectedToolChange={setSelectedToolId}
      onSelectedContainerKeyChange={setSelectedContainerKeyId}
      onRefresh={props.onRefresh}
    />
    <RevealAnimation open={!!reveal()} ready={reveal()?.ready} mode={props.settings?.animations?.container ?? "slot-machine"} title="Container opening" candidates={reveal()?.candidates ?? []} result={reveal()?.result ?? { name: "Item" }} onComplete={() => { const current = reveal(); setReveal(undefined); current?.complete(); }} />
  </>);
}
