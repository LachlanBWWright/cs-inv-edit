import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type { InventoryItemDto, RelatedItemDto, SettingsData } from "@cs-inv-edit/contracts";
import { Dialog } from "./ui/Dialog.js";
import { RelatedItemPreview, type RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { containerItemOdds } from "./related-item-preview-utils.js";
import { WearRangeBar } from "./ui/WearRangeBar.js";
import { ActionBar, DiagnosticsPanel, ItemHeader, PropertyGrid, RenameEditor, TradeUpOutcomes } from "./inventory-details-panel-sections.js";
import { itemDisplayName } from "./inventory-view-utils.js";
import { TradeUpContractReveal } from "./ui/TradeUpContractReveal.js";
import { MOCK_RESULT_DELAY_MS, randomRevealCandidate, RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";

function SelectedItemContent(props: { selected: InventoryItemDto; panelProps: InventoryDetailsPanelProps }) {
  return (
    <div class="space-y-4">
      <ItemHeader selected={props.selected} />
      <PropertyGrid selected={props.selected} selectedMarketPreview={props.panelProps.selectedMarketPreview} selectedMarketLoading={props.panelProps.selectedMarketLoading ?? false} onOpenCollection={props.panelProps.onOpenCollection ?? (() => undefined)} />
      <Show when={props.selected.kind === "weapon_skin" && props.selected.paintWear !== undefined}>
        <WearRangeBar wear={props.selected.paintWear!} min={props.selected.paintWearMin} max={props.selected.paintWearMax} />
      </Show>
      <TradeUpOutcomes selected={props.selected} onPreview={props.panelProps.onPreviewTradeUp} />
      <ActionBar selected={props.selected} pending={props.panelProps.pending} canOpenContainer={props.panelProps.canOpenContainer} canUseNameTagOn={props.panelProps.canUseNameTagOn} compatibleContainerKey={props.panelProps.compatibleContainerKey} compatibleContainerKeys={props.panelProps.compatibleContainerKeys} selectedContainerKeyId={props.panelProps.selectedContainerKeyId} containerStatusMessage={props.panelProps.containerStatusMessage} onOpenContainer={props.panelProps.onOpenContainer} onOpenRenameEditor={props.panelProps.onOpenRenameEditor} onRemoveName={props.panelProps.onRemoveName} onShowContents={props.panelProps.onShowContents ?? (() => undefined)} onViewStorageContents={props.panelProps.onViewStorageContents ?? (() => undefined)} onSelectedContainerKeyChange={props.panelProps.onSelectedContainerKeyChange} />
      <RenameEditor selected={props.selected} renameOpen={props.panelProps.renameOpen} draftName={props.panelProps.draftName} nameTagTools={props.panelProps.nameTagTools} pending={props.panelProps.pending} selectedToolId={props.panelProps.selectedToolId} onRenameSubmit={props.panelProps.onRenameSubmit} onCloseRename={props.panelProps.onCloseRename} onDraftNameChange={props.panelProps.onDraftNameChange} onSelectedToolChange={props.panelProps.onSelectedToolChange} />
      <DiagnosticsPanel selected={props.selected} inventoryDebugEnabled={props.panelProps.inventoryDebugEnabled} />
    </div>
  );
}

function InventoryDetailsPanel(props: InventoryDetailsPanelProps) {
  const [contentsDialog, setContentsDialog] = createSignal<{ title: string; description: string; items: RelatedItemDto[]; context: RelatedItemPreviewContext }>();
  const [nestedCollection, setNestedCollection] = createSignal<RelatedItemDto>();
  const [selectedMarketPreview, setSelectedMarketPreview] = createSignal<RelatedItemDto>();
  const [selectedMarketLoading, setSelectedMarketLoading] = createSignal(false);
  const [tradeUpPreview, setTradeUpPreview] = createSignal<{ result: RevealItem; ready: boolean; candidates: RevealItem[] }>();
  let tradeUpPreviewTimer: number | undefined;
  let requestedMarketName = "";

  const clearTradeUpPreviewTimer = () => {
    if (tradeUpPreviewTimer !== undefined) window.clearTimeout(tradeUpPreviewTimer);
    tradeUpPreviewTimer = undefined;
  };
  onCleanup(clearTradeUpPreviewTimer);

  const previewTradeUp = (item: InventoryItemDto) => {
    const candidates = (item.tradeUpItems ?? []).map((outcome): RevealItem => ({
      name: outcome.marketName || outcome.name,
      imageUrl: outcome.imageUrl,
      rarity: outcome.rarity,
      kind: outcome.kind,
      wear: outcome.paintWear,
      wearMin: outcome.wearMin,
      wearMax: outcome.wearMax,
      isStatTrak: item.isStatTrak,
    }));
    const fallback = candidates[0];
    if (!fallback) return;
    clearTradeUpPreviewTimer();
    const mode = props.settings?.animations?.tradeUp ?? "slot-machine";
    if (mode === "none" || mode === "contract-none") {
      setTradeUpPreview({ result: randomRevealCandidate(candidates, fallback), ready: true, candidates });
      return;
    }
    setTradeUpPreview({ result: fallback, ready: false, candidates });
    tradeUpPreviewTimer = window.setTimeout(() => {
      setTradeUpPreview((current) => current ? { ...current, result: randomRevealCandidate(candidates, fallback), ready: true } : current);
      tradeUpPreviewTimer = undefined;
    }, MOCK_RESULT_DELAY_MS);
  };

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
    onPreviewTradeUp: previewTradeUp,
    onOpenCollection: (title: string, items: RelatedItemDto[], context: RelatedItemPreviewContext) => setContentsDialog({ title, description: "Items belonging to this collection", items, context }),
    onShowContents: () => setContentsDialog({ title: itemDisplayName(props.selectedItem!), description: contentsDescription, items: props.selectedItem?.containerItems ?? [], context: "container" }),
    onViewStorageContents: async () => {
      const selected = props.selectedItem;
      if (!selected || selected.kind !== "storage_unit") return;
      await props.onLoadStorageContents(selected.id);
    },
  } as InventoryDetailsPanelProps;

  return (
    <>
      <Show when={(props.settings?.animations?.tradeUp ?? "slot-machine").startsWith("contract-")} fallback={
        <RevealAnimation open={!!tradeUpPreview()} ready={tradeUpPreview()?.ready} immediate={(props.settings?.animations?.tradeUp ?? "slot-machine") === "none"} mode={(props.settings?.animations?.tradeUp ?? "slot-machine") as "none" | "countdown" | "slot-machine"} title="Hypothetical trade-up" candidates={tradeUpPreview()?.candidates ?? []} result={tradeUpPreview()?.result ?? { name: "Trade-up result" }} onComplete={() => { clearTradeUpPreviewTimer(); setTradeUpPreview(undefined); }} />
      }>
        <TradeUpContractReveal open={!!tradeUpPreview()} ready={tradeUpPreview()?.ready} mode={props.settings?.animations?.tradeUp ?? "contract-slot-machine"} candidates={tradeUpPreview()?.candidates ?? []} result={tradeUpPreview()?.result ?? { name: "Trade-up result" }} onComplete={() => { clearTradeUpPreviewTimer(); setTradeUpPreview(undefined); }} />
      </Show>
      <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show keyed when={props.selectedItem} fallback={<p class="text-sm text-slate-400">No item selected.</p>}>
        {(selected) => <SelectedItemContent selected={selected} panelProps={detailsPanelProps} />}
          </Show>
        </div>
      </div>
      <Dialog open={!!contentsDialog()} title={contentsDialog()?.title ?? "Items"} description={contentsDialog()?.description} onOpenChange={(open) => { if (!open) setContentsDialog(undefined); }}>
        <Show when={(contentsDialog()?.items.length ?? 0) > 0} fallback={<p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">No item contents were found in the current CS2 schema.</p>}>
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={sortRelatedItemsByRarity(contentsDialog()?.items ?? [])}>{(item) => <RelatedItemPreview item={item} context={contentsDialog()?.context} probability={contentsDialog()?.context === "container" ? contentsOdds().get(item) : undefined} onRequestMarketPreview={props.onMarketPreview} onOpenCollection={setNestedCollection} />}</For>
          </div>
        </Show>
      </Dialog>
      <Dialog open={!!nestedCollection()} title={nestedCollection()?.name ?? "Rare Special Items"} description="Possible knife or glove finishes in this case" onOpenChange={(open) => { if (!open) setNestedCollection(undefined); }}>
        <Show when={(nestedCollection()?.items?.length ?? 0) > 0} fallback={<p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">CS2 identifies this rare-special collection, but does not publish its individual contents in the client item schema.</p>}>
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={sortRelatedItemsByRarity(nestedCollection()?.items ?? [])}>{(item) => <RelatedItemPreview item={item} context="collection" onRequestMarketPreview={props.onMarketPreview} />}</For>
          </div>
        </Show>
      </Dialog>
    </>
  );
}

export interface InventoryDetailsPanelProps {
  selectedItem: InventoryItemDto | undefined;
  settings: SettingsData | undefined;
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
  onLoadStorageContents: (casketId: string) => Promise<boolean>;
  onViewStorageContents?: () => Promise<void> | void;
  onPreviewTradeUp?: (item: InventoryItemDto) => void;
}

export { InventoryDetailsPanel };
