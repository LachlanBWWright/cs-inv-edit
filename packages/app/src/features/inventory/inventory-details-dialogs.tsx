import { For, Show, type Accessor, type Setter } from "solid-js";
import type { RelatedItemDto } from "@cs-inv-edit/contracts";
import { Dialog } from "../../shared/ui/Dialog.js";
import { RelatedItemPreview, type RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { ReturnEstimateCard } from "../commerce/ReturnEstimateCard.js";
import type { ReturnEstimate } from "../commerce/roi-utils.js";

type ContentsDialog = { title: string; description: string; items: RelatedItemDto[]; context: RelatedItemPreviewContext };

function ContentsDialogPanel(props: {
  contentsDialog: Accessor<ContentsDialog | undefined>;
  setContentsDialog: Setter<ContentsDialog | undefined>;
  containerReturn: Accessor<ReturnEstimate | undefined>;
  containerReturnLoading: Accessor<boolean>;
  contentsOdds: Accessor<Map<RelatedItemDto, number>>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  setNestedCollection: Setter<RelatedItemDto | undefined>;
}) {
  const dialog = () => props.contentsDialog();
  const items = () => sortRelatedItemsByRarity(dialog()?.items ?? []);
  const hasItems = () => (dialog()?.items.length ?? 0) > 0;
  const probability = (item: RelatedItemDto) =>
    dialog()?.context === "container" ? props.contentsOdds().get(item) : undefined;

  return (
    <Dialog
      open={!!dialog()}
      title={dialog()?.title ?? "Items"}
      description={dialog()?.description}
      onOpenChange={(open) => {
        if (!open) props.setContentsDialog(undefined);
      }}
    >
      <Show when={dialog()?.context === "container"}>
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
        when={hasItems()}
        fallback={
          <p class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            No item contents were found in the current CS2 schema.
          </p>
        }
      >
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={items()}>
            {(item) => (
              <RelatedItemPreview
                item={item}
                context={dialog()?.context}
                probability={probability(item)}
                onRequestMarketPreview={props.onMarketPreview}
                onOpenCollection={props.setNestedCollection}
              />
            )}
          </For>
        </div>
      </Show>
    </Dialog>
  );
}

function NestedCollectionDialogPanel(props: {
  nestedCollection: Accessor<RelatedItemDto | undefined>;
  setNestedCollection: Setter<RelatedItemDto | undefined>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
}) {
  const collection = () => props.nestedCollection();
  const items = () => sortRelatedItemsByRarity(collection()?.items ?? []);
  const hasItems = () => (collection()?.items?.length ?? 0) > 0;

  return (
    <Dialog
      open={!!collection()}
      title={collection()?.name ?? "Rare Special Items"}
      description="Possible knife or glove finishes in this case"
      onOpenChange={(open) => {
        if (!open) props.setNestedCollection(undefined);
      }}
    >
      <Show
        when={hasItems()}
        fallback={
          <p class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            CS2 identifies this rare-special collection, but does not publish its individual contents in the client item schema.
          </p>
        }
      >
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={items()}>
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
  );
}

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
      <ContentsDialogPanel
        contentsDialog={props.contentsDialog}
        setContentsDialog={props.setContentsDialog}
        containerReturn={props.containerReturn}
        containerReturnLoading={props.containerReturnLoading}
        contentsOdds={props.contentsOdds}
        onMarketPreview={props.onMarketPreview}
        setNestedCollection={props.setNestedCollection}
      />
      <NestedCollectionDialogPanel
        nestedCollection={props.nestedCollection}
        setNestedCollection={props.setNestedCollection}
        onMarketPreview={props.onMarketPreview}
      />
    </>
  );
}
