import { For, Show } from "solid-js";
import type { StoreSnapshot } from "@cs-inv-edit/contracts";
import { Dialog } from "../../shared/ui/Dialog.js";

type StoreOffer = StoreSnapshot["offers"][number];

function StoreContentItem(props: {
  item: NonNullable<StoreOffer["items"]>[number];
}) {
  return (
    <div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <Show when={props.item.imageUrl}>
        <img
          class="mx-auto h-28 object-contain"
          src={props.item.imageUrl}
          alt=""
        />
      </Show>
      <p class="mt-2 text-sm font-medium">
        {props.item.marketName || props.item.name}
      </p>
    </div>
  );
}

export function StoreContentsDialog(props: {
  offer: StoreOffer | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!props.offer}
      title={props.offer?.name || "Store item"}
      description="Item delivered by this store offer"
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Show
        when={(props.offer?.items?.length ?? 0) > 0}
        fallback={
          <p class="text-sm text-slate-400">
            No separate produced-item preview is defined for this offer.
          </p>
        }
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <For each={props.offer?.items ?? []}>
            {(item) => <StoreContentItem item={item} />}
          </For>
        </div>
      </Show>
    </Dialog>
  );
}
