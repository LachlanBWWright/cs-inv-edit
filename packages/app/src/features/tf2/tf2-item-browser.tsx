import { Show } from "solid-js";
import type { CompactMode } from "../../shared/ui-types.js";
import { TF2CompatibleItemGroups } from "./tf2-compatible-item-groups.js";
import type { TF2Item } from "./tf2-loadout-model.js";

function EmptyTF2ItemBrowser(props: {
  canRefresh: boolean;
  onRefresh: () => void;
}) {
  return (
    <div class="py-12 text-center">
      <p class="text-sm text-slate-500">
        No owned items match this class and slot.
      </p>
      <Show when={props.canRefresh}>
        <button
          class="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"
          onClick={props.onRefresh}
        >
          Load TF2 inventory
        </button>
      </Show>
    </div>
  );
}

export function TF2ItemBrowser(props: {
  inventoryReady: boolean;
  loading: boolean;
  snapshotStatus: string | undefined;
  query: string;
  selectedSlot: { name: string };
  compatibleItems: TF2Item[];
  compatibleGroups: Array<{ name: string; items: TF2Item[] }>;
  equippedItem: TF2Item | undefined;
  cardMinimumWidth: number;
  cardHeight: number;
  compactMode: CompactMode;
  onRefresh: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (item: TF2Item) => void;
  mobileVisible: boolean;
  containerClass?: string;
}) {
  return (
    <section
      class={`${props.mobileVisible ? "block" : "hidden"} ${props.containerClass ?? ""}`}
    >
      <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 pb-3">
        <div>
          <h2 class="font-semibold text-slate-100">
            {props.selectedSlot.name}
          </h2>
          <p class="text-xs text-slate-500">
            {props.compatibleItems.length} compatible owned items
            {props.equippedItem ? ` · ${props.equippedItem.name} equipped` : ""}
          </p>
        </div>
        <input
          class="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 sm:w-64"
          placeholder="Filter items"
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
      </div>
      <Show
        when={!props.loading && props.inventoryReady}
        fallback={
          <p class="py-12 text-center text-sm text-slate-500">
            Loading your TF2 inventory…
          </p>
        }
      >
        <Show
          when={props.compatibleItems.length}
          fallback={
            <EmptyTF2ItemBrowser
              canRefresh={props.snapshotStatus !== "ready"}
              onRefresh={props.onRefresh}
            />
          }
        >
          <TF2CompatibleItemGroups
            groups={props.compatibleGroups}
            cardMinimumWidth={props.cardMinimumWidth}
            cardHeight={props.cardHeight}
            compactMode={props.compactMode}
            equippedItem={props.equippedItem}
            onSelect={(item) => props.onSelect(item)}
          />
        </Show>
      </Show>
    </section>
  );
}
