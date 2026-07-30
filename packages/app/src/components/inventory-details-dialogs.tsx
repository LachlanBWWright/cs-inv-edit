import { For, Show, type Accessor, type Setter } from "solid-js";
import type { RelatedItemDto } from "@cs-inv-edit/contracts";
import { Dialog } from "./ui/Dialog.js";
import { RelatedItemPreview, type RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { ReturnEstimateCard } from "./ReturnEstimateCard.js";
import type { ReturnEstimate } from "./roi-utils.js";

type ContentsDialog = { title: string; description: string; items: RelatedItemDto[]; context: RelatedItemPreviewContext };

export function InventoryDetailsDialogs(props: {
  contentsDialog: Accessor<ContentsDialog | undefined>;
  setContentsDialog: Setter<ContentsDialog | undefined>;
  nestedCollection: Accessor<RelatedItemDto | undefined>;
  setNestedCollection: Setter<RelatedItemDto | undefined>;
  containerReturn: Accessor<ReturnEstimate | undefined>;
  containerReturnLoading: Accessor<boolean>;
  contentsOdds: Accessor<Map<RelatedItemDto, number>>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
}) {
  return (
    <>
      <Dialog
        open={!!props.contentsDialog()}
        title={props.contentsDialog()?.title ?? "Items"}
        description={props.contentsDialog()?.description}
        onOpenChange={(open) => {
          if (!open) props.setContentsDialog(undefined);
        }}
      >
        <Show when={props.contentsDialog()?.context === "container"}>
          <div class="mb-3">
            <ReturnEstimateCard
              estimate={props.containerReturn()}
              loading={props.containerReturnLoading()}
              costLabel="Container + key"
              note="Expected value uses the displayed schema odds and available market prices; fees are excluded."
            />
          </div>
        </Show>
        <Show
          when={(props.contentsDialog()?.items.length ?? 0) > 0}
          fallback={
            <p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
              No item contents were found in the current CS2 schema.
            </p>
          }
        >
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={sortRelatedItemsByRarity(props.contentsDialog()?.items ?? [])}>
              {(item) => (
                <RelatedItemPreview
                  item={item}
                  context={props.contentsDialog()?.context}
                  probability={
                    props.contentsDialog()?.context === "container"
                      ? props.contentsOdds().get(item)
                      : undefined
                  }
                  onRequestMarketPreview={props.onMarketPreview}
                  onOpenCollection={props.setNestedCollection}
                />
              )}
            </For>
          </div>
        </Show>
      </Dialog>
      <Dialog
        open={!!props.nestedCollection()}
        title={props.nestedCollection()?.name ?? "Rare Special Items"}
        description="Possible knife or glove finishes in this case"
        onOpenChange={(open) => {
          if (!open) props.setNestedCollection(undefined);
        }}
      >
        <Show
          when={(props.nestedCollection()?.items?.length ?? 0) > 0}
          fallback={
            <p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">
              CS2 identifies this rare-special collection, but does not publish
              its individual contents in the client item schema.
            </p>
          }
        >
          <div class="grid gap-2 sm:grid-cols-2">
            <For
              each={sortRelatedItemsByRarity(props.nestedCollection()?.items ?? [])}
            >
              {(item) => (
                <RelatedItemPreview
                  item={item}
                  context="collection"
                  onRequestMarketPreview={props.onMarketPreview}
                />
              )}
            </For>
          </div>
        </Show>
      </Dialog>
    </>
  );
}

