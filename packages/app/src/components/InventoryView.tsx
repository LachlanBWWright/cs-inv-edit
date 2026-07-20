import { createMemo, createSignal } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, OpenContainerRequest, RelatedItemDto, SettingsData } from "@cs-inv-edit/contracts";
import { InventoryViewContent } from "./InventoryViewContent.js";
import { RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import { itemDisplayName, itemKey, itemKindLabel, itemWeaponName, resolveSelectedInventoryItem, sortInventoryItems, type InventorySort } from "./inventory-view-utils.js";
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
  setQuery: (value: string) => void;
  kindFilter: "all" | InventoryItemDto["kind"];
  setKindFilter: (value: "all" | InventoryItemDto["kind"]) => void;
  compactMode: "icons" | "concise" | "detailed";
  setCompactMode: (value: "icons" | "concise" | "detailed") => void;
  onRefresh: () => void;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onRename: (input: { subjectItemId: string; toolItemId: string; name: string }) => Promise<unknown>;
  onRemoveName: (input: { itemId: string }) => Promise<unknown>;
  onOpenContainer: (input: OpenContainerRequest) => Promise<unknown>;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const mode = createMemo(() => props.mode);
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [draftName, setDraftName] = createSignal("");
  const [selectedToolId, setSelectedToolId] = createSignal("");
  const [statusMessage, setStatusMessage] = createSignal("");
  const [containerStatusMessage, setContainerStatusMessage] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [reveal, setReveal] = createSignal<{ result: RevealItem; candidates: RevealItem[]; complete: () => void }>();
  const [selectedItemIds, setSelectedItemIds] = createSignal<string[]>([]);
  const [rarityFilter, setRarityFilter] = createSignal("all");
  const [weaponFilter, setWeaponFilter] = createSignal("all");
  const [collectionFilter, setCollectionFilter] = createSignal("all");
  const [sort, setSort] = createSignal<InventorySort>("name");

  const rarityOptions = createMemo(() => [...new Set((props.inventory?.items ?? []).map((item) => item.rarity).filter((value): value is string => !!value))].sort());
  const weaponOptions = createMemo(() => [...new Set((props.inventory?.items ?? []).map(itemWeaponName).filter((value): value is string => !!value))].sort());
  const collectionOptions = createMemo(() => [...new Set((props.inventory?.items ?? []).map((item) => item.collection).filter((value): value is string => !!value))].sort());

  const playReveal = (result: RevealItem, candidates: RevealItem[]) => {
    if ((props.settings?.animations?.container ?? "slot-machine") === "none") return Promise.resolve();
    return new Promise<void>((resolve) => setReveal({ result, candidates, complete: resolve }));
  };

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
      const matchesRarity = rarityFilter() === "all" || item.rarity === rarityFilter();
      const matchesWeapon = weaponFilter() === "all" || itemWeaponName(item) === weaponFilter();
      const matchesCollection = collectionFilter() === "all" || item.collection === collectionFilter();
      return matchesQuery && matchesKind && matchesRarity && matchesWeapon && matchesCollection;
    });
    return sortInventoryItems(matches, sort());
  };

  const selectedItem = () => resolveSelectedInventoryItem(filteredItems(), props.selectedItemId);

  const selectedItemKey = () => {
    const selected = selectedItem();
    if (!selected) return undefined;
    const index = filteredItems().indexOf(selected);
    return itemKey(selected, index);
  };

  const selectItem = (item: InventoryItemDto) => {
	if (mode() !== "inventory") {
		setSelectedItemIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
		props.setSelectedItemId(item.id);
		return;
	}
	setSelectedItemIds([]);
    props.setSelectedItemId(item.id);
  };

  const nameTagTools = () => (props.inventory?.items ?? []).filter((item) => item.isNameTagTool);
  const compatibleContainerKey = () => {
    const required = selectedItem()?.requiredKeyDefIndexes ?? [];
    return (props.inventory?.items ?? []).find((item) => item.defindex !== undefined && required.includes(item.defindex));
  };
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
    const canOpen = item.kind === "container" || `${item.kind} ${item.name} ${item.marketName ?? ""}`.toLowerCase().includes("container") || `${item.kind} ${item.name} ${item.marketName ?? ""}`.toLowerCase().includes("capsule") || `${item.kind} ${item.name} ${item.marketName ?? ""}`.toLowerCase().includes("case");
    if (!canOpen) {
      const message = "Selected item is not a container or capsule.";
      setContainerStatusMessage(message);
      return;
    }
    setPending(true);
    setContainerStatusMessage("Sending open request to CS2...");
    const keyItemId = compatibleContainerKey()?.id;
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
        await playReveal(
        { name: itemDisplayName(openedItem), imageUrl: openedItem.imageUrl, rarity: openedItem.rarity, kind: openedItem.kind, wear: openedItem.paintWear, wearMin: openedItem.paintWearMin, wearMax: openedItem.paintWearMax, isStatTrak: openedItem.isStatTrak },
        (item.containerItems ?? []).map((candidate) => ({ name: candidate.marketName || candidate.name, imageUrl: candidate.imageUrl, rarity: candidate.rarity, kind: candidate.kind, wear: candidate.paintWear, wearMin: candidate.wearMin, wearMax: candidate.wearMax, supportsStatTrak: candidate.kind === "weapon_skin" })),
        );
        }
        setContainerStatusMessage(message);
        if (openedItem?.id) {
        props.setSelectedItemId(openedItem.id);
        }
      }
    }, (error) => setContainerStatusMessage(appErrorMessage(error, "Failed to open container.")));
    setPending(false);
  };

  const selectedLabel = () => {
    const selected = selectedItem();
    return selected ? `${selected.kind} ${selected.name} ${selected.marketName ?? ""}`.toLowerCase() : "";
  };

  return (<>
    <InventoryViewContent
      inventory={props.inventory}
      selectionMode={mode()}
	  selectedItemIds={selectedItemIds()}
      connection={props.connection}
      settings={props.settings}
      query={props.query}
      kindFilter={props.kindFilter}
      rarityFilter={rarityFilter()}
      weaponFilter={weaponFilter()}
      collectionFilter={collectionFilter()}
      sort={sort()}
      rarityOptions={rarityOptions()}
      weaponOptions={weaponOptions()}
      collectionOptions={collectionOptions()}
      filteredItems={filteredItems()}
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
      canOpenContainer={!!selectedItem() && (selectedItem()?.kind === "container" || selectedLabel().includes("container") || selectedLabel().includes("capsule") || selectedLabel().includes("case"))}
      canUseNameTagOn={selectedItem()?.kind === "weapon_skin" && nameTagTools().length > 0}
      onRefresh={props.onRefresh}
      onMarketPreview={props.onMarketPreview}
      onQueryChange={props.setQuery}
      onKindFilterChange={props.setKindFilter}
      onRarityFilterChange={setRarityFilter}
      onWeaponFilterChange={setWeaponFilter}
      onCollectionFilterChange={setCollectionFilter}
      onSortChange={setSort}
      compactMode={props.compactMode}
      onCompactModeChange={props.setCompactMode}
      onSelectItem={selectItem}
      onOpenRenameEditor={openRenameEditor}
      onRenameSubmit={handleRenameSubmit}
      onRemoveName={handleRemoveName}
      onOpenContainer={handleOpenContainer}
      onCloseRename={() => setRenameOpen(false)}
      onDraftNameChange={setDraftName}
      onSelectedToolChange={setSelectedToolId}
    />
    <RevealAnimation open={!!reveal()} mode={props.settings?.animations?.container ?? "slot-machine"} title="Container opening" candidates={reveal()?.candidates ?? []} result={reveal()?.result ?? { name: "Item" }} onComplete={() => { const current = reveal(); setReveal(undefined); current?.complete(); }} />
  </>);
}
