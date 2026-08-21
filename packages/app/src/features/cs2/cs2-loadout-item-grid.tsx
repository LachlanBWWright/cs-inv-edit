import { For } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { ItemPreviewMedia } from "../inventory/ItemPreviewMedia.js";

function LoadoutItemButton(props: {
  item: InventoryItemDto;
  enabled: boolean;
  loadingId: string;
  equipped: boolean;
  onEquip: (item: InventoryItemDto) => void;
}) {
  return (
    <button
      disabled={!props.enabled || !!props.loadingId || props.equipped}
      class={`relative min-h-36 rounded-xl border p-3 text-left disabled:cursor-default ${props.equipped ? "border-cyan-400/40 bg-cyan-950" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}
      onClick={() => props.onEquip(props.item)}
    >
      <ItemPreviewMedia
        name={props.item.name}
        imageUrl={props.item.imageUrl}
        variant="loadout-slot"
      />
      <p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">{props.item.name}</p>
      <p class="mt-1 text-xs text-slate-500">
        {props.loadingId === props.item.id ? "Equipping…" : props.equipped ? "Equipped" : "Equip"}
      </p>
    </button>
  );
}

export function CS2LoadoutItemGrid(props: {
  items: InventoryItemDto[];
  enabled: boolean;
  loadingId: string;
  isEquipped: (item: InventoryItemDto) => boolean;
  onEquip: (item: InventoryItemDto) => void;
}) {
  return (
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      <For each={props.items}>
        {(item) => <LoadoutItemButton item={item} enabled={props.enabled} loadingId={props.loadingId} equipped={props.isEquipped(item)} onEquip={props.onEquip} />}
      </For>
    </div>
  );
}
