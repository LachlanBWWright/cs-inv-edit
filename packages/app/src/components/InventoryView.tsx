import { createSignal, For, Show } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";

export interface InventoryViewProps {
  inventory: InventorySnapshot | undefined;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string | undefined) => void;
  connection: ConnectionStatus | undefined;
  onRefresh: () => void;
  onRename: (input: { subjectItemId: string; toolItemId: string; name: string }) => Promise<unknown>;
  onRemoveName: (input: { itemId: string }) => Promise<unknown>;
  onToast?: (toast: { title: string; description?: string; variant?: "default" | "success" | "warning" | "danger" }) => void;
}

export function InventoryView(props: InventoryViewProps) {
  const [query, setQuery] = createSignal("");
  const [kindFilter, setKindFilter] = createSignal<"all" | InventoryItemDto["kind"]>("all");
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [draftName, setDraftName] = createSignal("");
  const [selectedToolId, setSelectedToolId] = createSignal("");
  const [statusMessage, setStatusMessage] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const filteredItems = () => {
    const q = query().toLowerCase();
    return (props.inventory?.items ?? []).filter((item) => {
      const searchable = [
        item.name,
        item.marketName,
        item.customName,
        item.kind,
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

  const selectedItem = () => filteredItems().find((item) => item.id === props.selectedItemId) ?? filteredItems()[0];
  const nameTagTools = () => (props.inventory?.items ?? []).filter((item) => item.isNameTagTool);
  const connected = () => props.connection?.state === "connected";
  const inventoryError = () => props.inventory?.error || props.inventory?.message;
  const inventoryDiagnostics = () => props.inventory?.diagnostics ?? [];

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
      <Show when={props.inventory?.status === "loading" || (connected() && props.inventory?.status === "requires_connection")}>
        <Alert>Loading CS2 inventory from Steam Game Coordinator...</Alert>
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
            <option value="cs2_econ_item">CS2 econ items</option>
            <option value="container">Containers</option>
            <option value="storage_unit">Storage units</option>
            <option value="unknown">Unknown</option>
          </Select>
        </CardContent>
      </Card>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Show when={filteredItems().length > 0} fallback={<Alert>No inventory items are loaded.</Alert>}>
            <For each={filteredItems()}>
            {(item) => (
              <Card class={`min-h-28 cursor-pointer transition ${props.selectedItemId === item.id ? "border-cyan-500/40 bg-cyan-500/10" : "bg-slate-900/70"}`} onClick={() => props.setSelectedItemId(item.id)}>
                <CardContent>
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <strong class="text-base leading-snug text-slate-50">{item.customName || item.marketName || item.name}</strong>
                      <p class="mt-1 text-sm text-slate-400">{item.marketName && item.customName ? item.marketName : item.kind}</p>
                    </div>
                    <span class="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">{item.kind}</span>
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
                  </dl>
                </CardContent>
              </Card>
            )}
            </For>
          </Show>
        </div>

        <Card>
          <CardContent>
            <Show when={selectedItem()} fallback={<p class="text-sm text-slate-400">No item selected.</p>}>
              {(item) => {
                const selected = item();

                return (
                  <div class="space-y-4">
                    <div>
                      <p class="text-sm font-medium text-slate-400">Selected item</p>
                      <h3 class="mt-1 text-xl font-semibold text-slate-50">{selected.customName || selected.marketName || selected.name}</h3>
                      <p class="mt-1 text-sm text-slate-400">{selected.marketName && selected.customName ? selected.marketName : selected.name}</p>
                    </div>

                    <div class="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
                      <div class="grid gap-3 sm:grid-cols-2">
                        <Show when={selected.kind}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Type</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.kind}</p>
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
                        <Show when={selected.stickers && selected.stickers.length > 0}>
                          <div>
                            <p class="text-xs uppercase tracking-wide text-slate-500">Stickers</p>
                            <p class="mt-1 font-medium text-slate-100">{selected.stickers?.length}</p>
                          </div>
                        </Show>
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => openRenameEditor(selected)} disabled={pending()}>
                        Rename
                      </Button>
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
                      </div>
                    </details>
                  </div>
                );
              }}
            </Show>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
