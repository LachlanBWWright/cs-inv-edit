import { createSignal } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
import { InventoryViewContent } from "./InventoryViewContent.js";
import { itemDisplayName, itemKey, itemKindLabel } from "./inventory-view-utils.js";

export interface InventoryViewProps {
  inventory: InventorySnapshot | undefined;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string | undefined) => void;
  connection: ConnectionStatus | undefined;
  settings: SettingsData | undefined;
  onRefresh: () => void;
  onRename: (input: { subjectItemId: string; toolItemId: string; name: string }) => Promise<unknown>;
  onRemoveName: (input: { itemId: string }) => Promise<unknown>;
  onOpenContainer: (input: { itemId: string }) => Promise<unknown>;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const [query, setQuery] = createSignal("");
  const [kindFilter, setKindFilter] = createSignal<"all" | InventoryItemDto["kind"]>("all");
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [draftName, setDraftName] = createSignal("");
  const [selectedToolId, setSelectedToolId] = createSignal("");
  const [statusMessage, setStatusMessage] = createSignal("");
  const [containerStatusMessage, setContainerStatusMessage] = createSignal("");
  const [localSelectedItemKey, setLocalSelectedItemKey] = createSignal<string | undefined>();
  const [pending, setPending] = createSignal(false);

  const filteredItems = () => {
    const q = query().toLowerCase();
    return (props.inventory?.items ?? []).filter((item) => {
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
      const matchesKind = kindFilter() === "all" || item.kind === kindFilter();
      return matchesQuery && matchesKind;
    });
  };

  const selectedItem = () => {
    const items = filteredItems();
    const selectedKey = localSelectedItemKey();
    if (selectedKey) {
      const keyed = items.find((item, index) => itemKey(item, index) === selectedKey);
      if (keyed) return keyed;
    }
    if (props.selectedItemId) {
      const byID = items.find((item) => item.id === props.selectedItemId);
      if (byID) return byID;
    }
    return items[0];
  };

  const selectedItemKey = () => {
    const selected = selectedItem();
    if (!selected) return undefined;
    const index = filteredItems().indexOf(selected);
    return itemKey(selected, index);
  };

  const selectItem = (item: InventoryItemDto, index: number) => {
    setLocalSelectedItemKey(itemKey(item, index));
    props.setSelectedItemId(item.id);
  };

  const nameTagTools = () => (props.inventory?.items ?? []).filter((item) => item.isNameTagTool);
  const connected = () => props.connection?.state === "connected";
  const inventoryError = () => props.inventory?.error || props.inventory?.message;
  const inventoryDiagnostics = () => props.inventory?.diagnostics ?? [];
  const inventoryLoading = () => props.inventory?.status === "loading" || (connected() && props.inventory?.status === "requires_connection");

  const openRenameEditor = (item: InventoryItemDto) => {
    setDraftName(item.customName || item.name);
    const firstTool = nameTagTools()[0]?.id;
    setSelectedToolId(firstTool ?? "");
    setRenameOpen(true);
    const index = filteredItems().indexOf(item);
    if (index >= 0) {
      setLocalSelectedItemKey(itemKey(item, index));
    }
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
    try {
      await props.onRename({ subjectItemId: item.id, toolItemId: toolId, name: draftName() });
      setStatusMessage("Custom name updated.");
      setRenameOpen(false);
      props.onToast?.({ title: "Custom name applied", description: `${item.name} now has a custom label.`, variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply custom name.";
      setStatusMessage(message);
      props.onToast?.({ title: "Rename failed", description: message, variant: "danger" });
    } finally {
      setPending(false);
    }
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
    try {
      await props.onRemoveName({ itemId: item.id });
      setStatusMessage("Custom name removed.");
      props.onToast?.({ title: "Custom name removed", description: `${item.name} is back to its original label.`, variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove custom name.";
      setStatusMessage(message);
      props.onToast?.({ title: "Remove-name failed", description: message, variant: "danger" });
    } finally {
      setPending(false);
    }
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
    try {
      const receipt = await props.onOpenContainer({ itemId: item.id });
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
        setContainerStatusMessage(message);
        if (openedItem?.id) {
          props.setSelectedItemId(openedItem.id);
          setLocalSelectedItemKey(undefined);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open container.";
      setContainerStatusMessage(message);
    } finally {
      setPending(false);
    }
  };

  const selected = selectedItem();
  const selectedLabel = selected ? `${selected.kind} ${selected.name} ${selected.marketName ?? ""}`.toLowerCase() : "";

  return (
    <InventoryViewContent
      inventory={props.inventory}
      connection={props.connection}
      settings={props.settings}
      query={query()}
      kindFilter={kindFilter()}
      filteredItems={filteredItems()}
      selectedItem={selected}
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
      canOpenContainer={!!selected && (selected.kind === "container" || selectedLabel.includes("container") || selectedLabel.includes("capsule") || selectedLabel.includes("case"))}
      canUseNameTagOn={!!selected && selected.kind === "weapon_skin" && nameTagTools().length > 0}
      onRefresh={props.onRefresh}
      onQueryChange={setQuery}
      onKindFilterChange={setKindFilter}
      onSelectItem={selectItem}
      onOpenRenameEditor={openRenameEditor}
      onRenameSubmit={handleRenameSubmit}
      onRemoveName={handleRemoveName}
      onOpenContainer={handleOpenContainer}
      onCloseRename={() => setRenameOpen(false)}
      onDraftNameChange={setDraftName}
      onSelectedToolChange={setSelectedToolId}
    />
  );
}
