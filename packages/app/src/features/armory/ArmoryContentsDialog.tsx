import { For, Show } from "solid-js";
import type { ArmorySnapshot, RelatedItemDto } from "@cs-inv-edit/contracts";
import { Dialog } from "../../shared/ui/Dialog.js";
import { RelatedItemPreview } from "../inventory/RelatedItemPreview.js";
import { sortRelatedItemsByRarity } from "../inventory/inventory-view-utils.js";

export function ArmoryContentsDialog(props: {
  offer: ArmorySnapshot["offers"][number] | undefined;
  onClose: () => void;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
}) {
  const renderItem = (item: RelatedItemDto) => (
    <RelatedItemPreview
      item={item}
      context="collection"
      onRequestMarketPreview={props.onMarketPreview}
    />
  );
  return (
    <Dialog
      open={!!props.offer}
      title={props.offer?.name || "Armory collection"}
      description="Possible items available from this Armory offer"
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Show
        when={(props.offer?.items?.length ?? 0) > 0}
        fallback={
          <p class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            No item contents were found in the current CS2 schema.
          </p>
        }
      >
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={sortRelatedItemsByRarity(props.offer?.items ?? [])}>
            {renderItem}
          </For>
        </div>
      </Show>
    </Dialog>
  );
}
