import { createEffect, createSignal, For, Show } from "solid-js";
import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";
import { Dialog } from "./ui/Dialog.js";
import { RelatedItemPreview, type RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { containerItemOdds } from "./related-item-preview-utils.js";
import { WearRangeBar } from "./ui/WearRangeBar.js";
import { ActionBar, DiagnosticsPanel, ItemHeader, PropertyGrid, RenameEditor, TradeUpOutcomes } from "./inventory-details-panel-sections.js";
import { itemDisplayName } from "./inventory-view-utils.js";

function SelectedItemContent(props: { selected: InventoryItemDto; panelProps: InventoryDetailsPanelProps }) {
  return (
    <div class="space-y-4">
      <ItemHeader selected={props.selected} />
      <PropertyGrid selected={props.selected} selectedMarketPreview={props.panelProps.selectedMarketPreview} selectedMarketLoading={props.panelProps.selectedMarketLoading ?? false} onOpenCollection={props.panelProps.onOpenCollection ?? (() => undefined)} />
      <Show when={props.selected.kind === "weapon_skin" && props.selected.paintWear !== undefined}>
        <WearRangeBar wear={props.selected.paintWear!} min={props.selected.paintWearMin} max={props.selected.paintWearMax} />
      </Show>
      <TradeUpOutcomes selected={props.selected} />
      <ActionBar selected={props.selected} pending={props.panelProps.pending} canOpenContainer={props.panelProps.canOpenContainer} canUseNameTagOn={props.panelProps.canUseNameTagOn} compatibleContainerKey={props.panelProps.compatibleContainerKey} compatibleContainerKeys={props.panelProps.compatibleContainerKeys} selectedContainerKeyId={props.panelProps.selectedContainerKeyId} containerStatusMessage={props.panelProps.containerStatusMessage} onOpenContainer={props.panelProps.onOpenContainer} onOpenRenameEditor={props.panelProps.onOpenRenameEditor} onRemoveName={props.panelProps.onRemoveName} onShowContents={props.panelProps.onShowContents ?? (() => undefined)} onSelectedContainerKeyChange={props.panelProps.onSelectedContainerKeyChange} />
      <RenameEditor selected={props.selected} renameOpen={props.panelProps.renameOpen} draftName={props.panelProps.draftName} nameTagTools={props.panelProps.nameTagTools} pending={props.panelProps.pending} selectedToolId={props.panelProps.selectedToolId} onRenameSubmit={props.panelProps.onRenameSubmit} onCloseRename={props.panelProps.onCloseRename} onDraftNameChange={props.panelProps.onDraftNameChange} onSelectedToolChange={props.panelProps.onSelectedToolChange} />
      <DiagnosticsPanel selected={props.selected} inventoryDebugEnabled={props.panelProps.inventoryDebugEnabled} />
    </div>
  );
}

function InventoryDetailsPanel(props: InventoryDetailsPanelProps) {
  const [contentsDialog, setContentsDialog] = createSignal<{ title: string; description: string; items: RelatedItemDto[]; context: RelatedItemPreviewContext }>();
  const [selectedMarketPreview, setSelectedMarketPreview] = createSignal<RelatedItemDto>();
  const [selectedMarketLoading, setSelectedMarketLoading] = createSignal(false);
  let requestedMarketName = "";

  createEffect(() => {
    const selected = props.selectedItem;
    const marketName = selected?.marketName ?? "";
    if (!marketName || selected?.marketable === false || selected?.marketPrice || requestedMarketName === marketName) return;
    requestedMarketName = marketName;
    setSelectedMarketPreview(undefined);
    setSelectedMarketLoading(true);
    void props.onMarketPreview(marketName).then((preview) => {
      if (requestedMarketName === marketName) {
        setSelectedMarketPreview(preview);
        setSelectedMarketLoading(false);
      }
    });
  });

  const contentsOdds = () => containerItemOdds(contentsDialog()?.items ?? []);
  const contentsDescription = "Opening odds, prices, and generated wear outcomes";
  const detailsPanelProps = {
    ...props,
    selectedMarketPreview: selectedMarketPreview(),
    selectedMarketLoading: selectedMarketLoading(),
    onOpenCollection: (title: string, items: RelatedItemDto[], context: RelatedItemPreviewContext) => setContentsDialog({ title, description: "Items belonging to this collection", items, context }),
    onShowContents: () => setContentsDialog({ title: itemDisplayName(props.selectedItem!), description: contentsDescription, items: props.selectedItem?.containerItems ?? [], context: "container" }),
  } as InventoryDetailsPanelProps;

  return (
    <>
      <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show keyed when={props.selectedItem} fallback={<p class="text-sm text-slate-400">No item selected.</p>}>
        {(selected) => <SelectedItemContent selected={selected} panelProps={detailsPanelProps} />}
          </Show>
        </div>
      </div>
      <Dialog open={!!contentsDialog()} title={contentsDialog()?.title ?? "Items"} description={contentsDialog()?.description} onOpenChange={(open) => { if (!open) setContentsDialog(undefined); }}>
        <Show when={(contentsDialog()?.items.length ?? 0) > 0} fallback={<p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">No item contents were found in the current CS2 schema.</p>}>
          <Show when={contentsDialog()?.context === "container"}>
            <div class="mb-3 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs leading-relaxed text-slate-400">
        Base item odds use the documented 5:1 ratio between adjacent rarity tiers and divide each tier evenly among its listed items. Eligible case weapon finishes have a separate 10% StatTrak™ chance. Float-cap conversion is reserved for expected-value calculations rather than displayed as additional per-item odds.
            </div>
          </Show>
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={sortRelatedItemsByRarity(contentsDialog()?.items ?? [])}>{(item) => <RelatedItemPreview item={item} context={contentsDialog()?.context} probability={contentsDialog()?.context === "container" ? contentsOdds().get(item) : undefined} onRequestMarketPreview={props.onMarketPreview} />}</For>
          </div>
        </Show>
      </Dialog>
    </>
  );
}

export interface InventoryDetailsPanelProps {
  selectedItem: InventoryItemDto | undefined;
  pending: boolean;
  renameOpen: boolean;
  draftName: string;
  selectedToolId: string;
  inventoryDebugEnabled: boolean;
  nameTagTools: InventoryItemDto[];
  compatibleContainerKey: InventoryItemDto | undefined;
  compatibleContainerKeys: InventoryItemDto[];
  selectedContainerKeyId: string;
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  containerStatusMessage: string;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: () => Promise<void> | void;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
  onSelectedContainerKeyChange: (value: string) => void;
  selectedMarketPreview?: RelatedItemDto;
  selectedMarketLoading?: boolean;
  onOpenCollection?: (title: string, items: RelatedItemDto[], context: RelatedItemPreviewContext) => void;
  onShowContents?: () => void;
}

export { InventoryDetailsPanel };
