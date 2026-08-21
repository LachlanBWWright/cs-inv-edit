import { For, Show } from "solid-js";
import { ItemPreviewMedia } from "../inventory/ItemPreviewMedia.js";
import type { TF2Item } from "./tf2-loadout-model.js";
import type { CompactMode } from "../../shared/ui-types.js";

export interface TF2CompatibleItemGroup {
  name: string;
  items: TF2Item[];
}

interface TF2CompatibleItemGroupsProps {
  groups: TF2CompatibleItemGroup[];
  cardMinimumWidth: number;
  cardHeight: number;
  compactMode: CompactMode;
  equippedItem: TF2Item | undefined;
  onSelect: (item: TF2Item) => void;
}

function CompatibleItemCard(props: {
  item: TF2Item;
  cardHeight: number;
  compactMode: CompactMode;
  equipped: boolean;
  onSelect: (item: TF2Item) => void;
}) {
  return (
    <button
      style={{
        height: `${props.cardHeight}px`,
        contain: "layout paint style",
      }}
      class={`inventory-item-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 p-3 text-left transition focus:outline-none ${props.equipped ? "border-slate-400 bg-slate-900" : "border-slate-800 hover:border-slate-600"}`}
      onClick={() => props.onSelect(props.item)}
    >
      <ItemPreviewMedia
        name={props.item.name}
        imageUrl={props.item.imageUrl}
        variant="economy-card"
      />
      <Show when={props.compactMode !== "icons"}>
        <p class="mt-2 line-clamp-2 text-sm font-medium text-slate-100">
          {props.item.name}
        </p>
      </Show>
      <Show when={props.equipped && props.compactMode !== "icons"}>
        <p class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Equipped
        </p>
      </Show>
    </button>
  );
}

function CompatibleItemGroupCard(props: {
  group: TF2CompatibleItemGroup;
  cardMinimumWidth: number;
  cardHeight: number;
  compactMode: CompactMode;
  equippedItem: TF2Item | undefined;
  onSelect: (item: TF2Item) => void;
}) {
  return (
    <section>
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {props.group.name}
      </h3>
      <div
        class="grid gap-3"
        style={{
          "grid-template-columns": `repeat(auto-fill, minmax(${props.cardMinimumWidth}px, 1fr))`,
        }}
      >
        <For each={props.group.items}>
          {(item) => (
            <CompatibleItemCard
              item={item}
              cardHeight={props.cardHeight}
              compactMode={props.compactMode}
              equipped={props.equippedItem?.assetId === item.assetId}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </div>
    </section>
  );
}

export function TF2CompatibleItemGroups(props: TF2CompatibleItemGroupsProps) {
  return (
    <div class="space-y-5 pt-4">
      <For each={props.groups}>
        {(group) => (
          <CompatibleItemGroupCard
            group={group}
            cardMinimumWidth={props.cardMinimumWidth}
            cardHeight={props.cardHeight}
            compactMode={props.compactMode}
            equippedItem={props.equippedItem}
            onSelect={props.onSelect}
          />
        )}
      </For>
    </div>
  );
}
