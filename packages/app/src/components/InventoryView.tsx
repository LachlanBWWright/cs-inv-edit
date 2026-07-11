import { createSignal, For, Show } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";

function itemKindLabel(kind: InventoryItemDto["kind"] | undefined) {
  switch (kind) {
    case "weapon_skin":
      return "Weapon skin";
    case "sticker_item":
      return "Sticker";
    case "tool_item":
      return "Tool";
    case "container":
      return "Container";
    case "storage_unit":
      return "Storage unit";
    case "cs2_econ_item":
      return "CS2 item";
    case "unknown":
      return "Unknown item";
    default:
      return "Item";
  }
}

function itemDisplayName(item: InventoryItemDto) {
  return item.customName || item.marketName || item.name || `CS2 item #${item.defindex}`;
}

function itemSubtitle(item: InventoryItemDto) {
  const title = itemDisplayName(item);
  const candidates = [
    item.customName ? item.marketName : undefined,
    item.collection,
    item.exterior,
    item.rarity,
    itemKindLabel(item.kind),
  ];
  return candidates.find((value) => value && value !== title) ?? "";
}

function itemInitials(item: InventoryItemDto) {
  const words = itemDisplayName(item)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
  return initials || "#";
}

function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
  const boxClass = () =>
    props.large
      ? "mt-3 flex h-32 w-full items-center justify-center rounded bg-slate-950 text-xl font-semibold text-slate-600"
      : "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass = () =>
    props.large
      ? "mt-3 h-32 w-full rounded bg-slate-950 object-contain"
      : "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain";

  return (
    <Show when={props.item.imageUrl} fallback={<div class={boxClass()}>{itemInitials(props.item)}</div>}>
      <img class={imageClass()} src={props.item.imageUrl} alt={itemDisplayName(props.item)} loading="lazy" />
    </Show>
  );
}

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

  const itemKey = (item: InventoryItemDto, index: number) => `${index}:${item.id}:${item.defindex ?? ""}:${item.marketName ?? item.name}`;
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
  const inventoryDebugEnabled = () => props.settings?.featureFlags.enableInventoryDebug ?? false;
  const canUseNameTagOn = (item: InventoryItemDto | undefined) => !!item && item.kind === "weapon_skin" && nameTagTools().length > 0;
  const canOpenContainer = (item: InventoryItemDto | undefined) => {
    if (!item) return false;
    const haystack = `${item.kind} ${item.name} ${item.marketName ?? ""}`.toLowerCase();
    return item.kind === "container" || haystack.includes("capsule") || haystack.includes("case") || haystack.includes("container");
  };
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
    if (!canOpenContainer(item)) {
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

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-3xl font-semibold text-slate-50">Inventory workspace</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-400">Inspect and edit inventory items without entering raw IDs.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => props.onRefresh()}>
            Refresh
          </Button>
        </div>
      </header>

      <Show when={props.inventory?.status === "requires_connection" && !connected()}>
        <Alert variant="warning">Connect a Steam account to load inventory items and enable name-tag editing.</Alert>
      </Show>
      <Show when={props.inventory?.status === "error"}>
        <Alert variant="danger">
          <div class="space-y-2">
            <p>Inventory sync is unavailable.</p>
            <Show when={inventoryError()}>
              <details class="text-xs text-rose-100/80">
                <summary class="cursor-pointer">Diagnostics</summary>
                <div class="mt-1 space-y-1 font-mono">
                  <p>{inventoryError()}</p>
                  <For each={inventoryDiagnostics()}>{(line) => <p>{line}</p>}</For>
                </div>
              </details>
            </Show>
          </div>
        </Alert>
      </Show>
      <Show when={props.inventory?.status === "ready" && inventoryDiagnostics().length > 0}>
        <Alert variant="warning">
          <details class="text-xs text-amber-100/80">
            <summary class="cursor-pointer">Inventory metadata diagnostics</summary>
            <div class="mt-1 space-y-1 font-mono">
              <For each={inventoryDiagnostics()}>{(line) => <p>{line}</p>}</For>
            </div>
          </details>
        </Alert>
      </Show>

      <Show when={statusMessage()}>
        <Alert>{statusMessage()}</Alert>
      </Show>

      <Card>
        <CardContent class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input class="max-w-none" placeholder="Search by name, type, collection, storage, stickers, or tools" value={query()} onInput={(event) => setQuery((event.currentTarget as HTMLInputElement | null)?.value ?? "")} />
          <Select value={kindFilter()} onChange={(event) => setKindFilter(((event.currentTarget as HTMLInputElement | null)?.value ?? "") as "all" | InventoryItemDto["kind"])}>
            <option value="all">All kinds</option>
            <option value="weapon_skin">Weapon skins</option>
            <option value="sticker_item">Stickers</option>
            <option value="tool_item">Tools</option>
            <option value="cs2_econ_item">CS2 items</option>
            <option value="container">Containers</option>
            <option value="storage_unit">Storage units</option>
            <option value="unknown">Unknown</option>
          </Select>
        </CardContent>
      </Card>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Show when={filteredItems().length > 0} fallback={<Alert>{inventoryLoading() ? "Loading CS2 inventory from Steam Game Coordinator..." : "No inventory items are loaded."}</Alert>}>
            <For each={filteredItems()}>
              {(item, index) => (
                <button
                  type="button"
                  class={`min-h-28 cursor-pointer rounded-2xl border border-slate-800 text-left shadow-[0_10px_60px_-30px_rgba(34,211,238,0.35)] transition duration-150 hover:border-cyan-400/50 hover:bg-slate-800/90 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.18)] focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${
                    selectedItemKey() === itemKey(item, index()) ? "border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]" : "bg-slate-900/70"
                  }`}
                  onClick={() => selectItem(item, index())}
                >
                  <CardContent>
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex min-w-0 gap-3">
                        <ItemIcon item={item} />
                        <div class="min-w-0">
                          <strong class="text-base leading-snug text-slate-50">{itemDisplayName(item)}</strong>
                          <Show when={itemSubtitle(item)}>
                            <p class="mt-1 text-sm text-slate-400">{itemSubtitle(item)}</p>
                          </Show>
                        </div>
                      </div>
                    </div>
                    <dl class="mt-4 grid gap-1 text-sm text-slate-400">
                      <Show when={item.collection}>
                        <div class="flex justify-between gap-3">
                          <dt>Collection</dt>
                          <dd>{item.collection}</dd>
                        </div>
                      </Show>
                      <Show when={item.exterior}>
                        <div class="flex justify-between gap-3">
                          <dt>Exterior</dt>
                          <dd>{item.exterior}</dd>
                        </div>
                      </Show>
                      <Show when={item.storageLocation}>
                        <div class="flex justify-between gap-3">
                          <dt>Storage</dt>
                          <dd>{item.storageLocation}</dd>
                        </div>
                      </Show>
                      <Show when={item.paintWear !== undefined}>
                        <div class="flex justify-between gap-3">
                          <dt>Wear</dt>
                          <dd>{item.paintWear}</dd>
                        </div>
                      </Show>
                      <Show when={item.marketPrice}>
                        <div class="flex justify-between gap-3">
                          <dt>Market</dt>
                          <dd>{item.marketPrice}</dd>
                        </div>
                      </Show>
                    </dl>
                  </CardContent>
                </button>
              )}
            </For>
          </Show>
        </div>

        <Card>
          <CardContent>
            <Show keyed when={selectedItem()} fallback={<p class="text-sm text-slate-400">No item selected.</p>}>
              {(selected) => (
                  <div class="space-y-4">
                    <div>
                      <p class="text-sm font-medium text-slate-400">Selected item</p>
                      <ItemIcon item={selected} large />
                      <h3 class="mt-3 text-xl font-semibold text-slate-50">{itemDisplayName(selected)}</h3>
                      <Show when={itemSubtitle(selected)}>
                        <p class="mt-1 text-sm text-slate-400">{itemSubtitle(selected)}</p>
                      </Show>
                    </div>

                    <div class="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
                      <div class="grid gap-3 sm:grid-cols-2">
                        <Show when={selected.kind}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Type</p>
                            <p class="mt-1 font-medium text-slate-100">{itemKindLabel(selected.kind)}</p>
                          </div>
                        </Show>
                        <Show when={selected.rarity}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Rarity</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.rarity}</p>
                          </div>
                        </Show>
                        <Show when={selected.exterior}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Exterior</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.exterior}</p>
                          </div>
                        </Show>
                        <Show when={selected.storageLocation}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Storage</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.storageLocation}</p>
                          </div>
                        </Show>
                        <Show when={selected.paintWear !== undefined}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Wear</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.paintWear}</p>
                          </div>
                        </Show>
                        <Show when={selected.marketPrice}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Market</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.marketPrice}</p>
                          </div>
                        </Show>
                        <Show when={selected.marketSellListings}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Listings</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.marketSellListings}</p>
                          </div>
                        </Show>
                        <Show when={selected.stickers && selected.stickers.length > 0}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Stickers</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.stickers?.length}</p>
                          </div>
                        </Show>
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <Show when={canOpenContainer(selected)}>
                        <div class="flex flex-col gap-2">
                          <Button onClick={() => void handleOpenContainer()} disabled={pending()}>
                            Open container
                          </Button>
                          <Show when={containerStatusMessage()}>
                            <p class="max-w-sm text-sm text-slate-400">{containerStatusMessage()}</p>
                          </Show>
                        </div>
                      </Show>
                      <Show when={canUseNameTagOn(selected)}>
                        <Button variant="secondary" onClick={() => openRenameEditor(selected)} disabled={pending()}>
                          Rename
                        </Button>
                      </Show>
                      <Show when={selected.hasCustomName || selected.customName}>
                        <Button variant="danger" class="bg-rose-600/90 hover:bg-rose-500" onClick={() => void handleRemoveName()} disabled={pending()}>
                          Remove custom name
                        </Button>
                      </Show>
                    </div>

                    <Show when={renameOpen()}>
                      <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                        <label class="block font-medium text-slate-100">Custom name</label>
                        <Input class="mt-2" value={draftName()} onInput={(event) => setDraftName((event.currentTarget as HTMLInputElement | null)?.value ?? "")} />
                        <Show when={nameTagTools().length > 0}>
                          <label class="mt-3 block font-medium text-slate-100">Name tag tool</label>
                          <Select class="mt-2 w-full" value={selectedToolId()} onChange={(event) => setSelectedToolId((event.currentTarget as HTMLInputElement | null)?.value ?? "")}>
                            <For each={nameTagTools()}>{(tool) => <option value={tool.id}>{tool.name}</option>}</For>
                          </Select>
                        </Show>
                        <Show when={nameTagTools().length === 0}>
                          <p class="mt-3 text-xs text-slate-500">No compatible name tag tools are available in the current inventory.</p>
                        </Show>
                        <div class="mt-4 flex flex-wrap gap-2">
                          <Button onClick={() => void handleRenameSubmit()} disabled={pending()}>
                            Apply
                          </Button>
                          <Button variant="secondary" onClick={() => setRenameOpen(false)} disabled={pending()}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </Show>

                    <details class="rounded-2xl border border-slate-800 p-3 text-sm text-slate-400">
                      <summary class="cursor-pointer font-medium text-slate-200">Diagnostics</summary>
                      <div class="mt-3 space-y-2 font-mono text-xs">
                        <p>Item ID: {selected.id}</p>
                        <Show when={selected.kind === "unknown"}>
                          <p>Kind: unsupported/unknown</p>
                        </Show>
                        <Show when={selected.unsupportedFields?.length}>
                          <p>Unsupported fields: {selected.unsupportedFields?.join(", ")}</p>
                        </Show>
                        <Show when={inventoryDebugEnabled() && selected.debug}>
                          {(debug) => (
                            <div class="space-y-1 border-t border-slate-800 pt-2">
                              <p>GC ID: {debug().gcId}</p>
                              <p>GC original ID: {debug().gcOriginalId}</p>
                              <p>GC defindex: {debug().gcDefIndex}</p>
                              <p>GC inventory: {debug().gcInventory}</p>
                              <p>GC quantity: {debug().gcQuantity}</p>
                              <p>GC quality: {debug().gcQuality}</p>
                              <p>GC rarity: {debug().gcRarity}</p>
                              <p>GC paint kit: {debug().gcPaintKit}</p>
                              <p>Description matched: {debug().descriptionMatched ? "yes" : "no"}</p>
                              <p>Market fallback used: {debug().marketDescriptionUsed ? "yes" : "no"}</p>
                              <Show when={debug().attributes}>
                                <p>Attributes: {JSON.stringify(debug().attributes)}</p>
                              </Show>
                            </div>
                          )}
                        </Show>
                      </div>
                    </details>
                  </div>
                )}
            </Show>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
