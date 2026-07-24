import { createEffect, createSignal, For, mergeProps, onCleanup, Show } from "solid-js";
import type { InitializeStorePurchaseRequest, InventoryItemDto, PriceScanResult, PurchaseSession, RelatedItemDto, SettingsData } from "@cs-inv-edit/contracts";
import { Dialog } from "./ui/Dialog.js";
import { RelatedItemPreview, type RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { isActiveTerminal, sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { containerItemOdds } from "./related-item-preview-utils.js";
import { WearRangeBar } from "./ui/WearRangeBar.js";
import { ActionBar, DiagnosticsPanel, ItemHeader, PropertyGrid, RenameEditor, TradeUpOutcomes } from "./inventory-details-panel-sections.js";
import { itemDisplayName } from "./inventory-view-utils.js";
import { TradeUpContractReveal } from "./ui/TradeUpContractReveal.js";
import { MOCK_RESULT_DELAY_MS, randomRevealCandidate, RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import { VendorPricePreview } from "./VendorPricePreview.js";
import { steamHostedSaleURL, steamInventoryAssetURL } from "./steam-hosted-selling.js";
import { expectedReturn, scanPriceMap, type ReturnEstimate } from "./roi-utils.js";
import { ReturnEstimateCard } from "./ReturnEstimateCard.js";
import { tradeUpInputCount } from "./trade-up-utils.js";
import { swapScreenshotURL } from "./cs2-screenshot.js";

function SelectedItemContent(props: { selected: InventoryItemDto; panelProps: InventoryDetailsPanelProps }) {
  const [confirmTerminalPurchase, setConfirmTerminalPurchase] = createSignal(false);
  const [terminalPurchaseMessage, setTerminalPurchaseMessage] = createSignal("");
  createEffect(() => {
    props.selected.id;
    setConfirmTerminalPurchase(false);
    setTerminalPurchaseMessage("");
  });
  const terminalOffers = () => props.selected.terminalOffers ?? [];
  const currentTerminalOffer = () => terminalOffers()[0];
  const rejectTerminalOffer = () => {
    setConfirmTerminalPurchase(false);
    void props.panelProps.onOpenContainer({ pointsRemaining: props.selected.terminalPointsRemaining ?? 0 });
  };
  const purchaseTerminalOffer = async () => {
    const offer = currentTerminalOffer();
    if (!offer?.purchasePrice) return;
    const session = await props.panelProps.onTerminalPurchase({
      offerId: `terminal:${props.selected.id}`,
      quantity: 1,
      expectedPriceSheetVersion: 0,
      expectedAmountMinor: offer.purchasePrice,
      supplementalData: props.selected.id,
    });
    setTerminalPurchaseMessage(session.message ?? session.status);
    if (session.checkoutUrl) window.open(session.checkoutUrl, "_blank", "noopener,noreferrer");
  };
  const inventoryURL = () => props.panelProps.steamId
    ? steamInventoryAssetURL(props.panelProps.steamId, { appId: 730, contextId: "2", assetId: props.selected.id })
    : undefined;
  const saleURL = () => steamHostedSaleURL({
    steamId: props.panelProps.steamId,
    appId: 730,
    contextId: "2",
    assetId: props.selected.id,
    marketable: props.selected.marketable,
    contained: !!props.selected.casketId,
  });
  const screenshotURL = () => props.selected.kind === "weapon_skin" ? swapScreenshotURL(props.selected.inspectUrl) : undefined;
  return (
    <div class="space-y-4">
      <ItemHeader selected={props.selected} />
      <PropertyGrid selected={props.selected} selectedMarketPreview={props.panelProps.selectedMarketPreview} selectedMarketLoading={props.panelProps.selectedMarketLoading ?? false} onOpenCollection={props.panelProps.onOpenCollection ?? (() => undefined)} />
      <VendorPricePreview appId={730} marketName={props.selected.marketName} marketable={props.selected.marketable} result={props.panelProps.selectedPriceScan} loading={props.panelProps.selectedPriceScanLoading ?? false} />
      <Show when={inventoryURL() || props.selected.inspectUrl}>
        <div class="grid gap-2 sm:grid-cols-2">
          <Show when={inventoryURL()}>{(viewURL) => (
            <a class="block w-full rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-3 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/40" href={viewURL()} target="_blank" rel="noopener noreferrer">
              View in inventory ↗
            </a>
          )}</Show>
          <Show when={saleURL()}>{(url) => (
            <a class="block w-full rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-center text-sm font-semibold text-emerald-100 hover:bg-emerald-900/40" href={url()} target="_blank" rel="noopener noreferrer">
              Sell on Steam ↗
            </a>
          )}</Show>
          <Show when={props.selected.inspectUrl}>{(url) => (
            <a class="block w-full rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-4 py-3 text-center text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40" href={url()} target="_blank" rel="noopener noreferrer">
              Inspect in game ↗
            </a>
          )}</Show>
          <Show when={screenshotURL()}>{(url) => (
            <a class="block w-full rounded-xl border border-violet-500/40 bg-violet-950/30 px-4 py-3 text-center text-sm font-semibold text-violet-100 hover:bg-violet-900/40" href={url()} target="_blank" rel="noopener noreferrer">
              Generate screenshot ↗
            </a>
          )}</Show>
        </div>
      </Show>
      <Show when={props.selected.kind === "weapon_skin" && props.selected.paintWear !== undefined}>
        <WearRangeBar wear={props.selected.paintWear!} min={props.selected.paintWearMin} max={props.selected.paintWearMax} />
      </Show>
      <TradeUpOutcomes selected={props.selected} onPreview={props.panelProps.onPreviewTradeUp} returnEstimate={props.panelProps.tradeUpReturnEstimate} returnEstimateLoading={props.panelProps.tradeUpReturnLoading} />
      <Show when={isActiveTerminal(props.selected)}>
        <section class="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-4">
          <h4 class="text-sm font-semibold text-violet-100">Current terminal offer</h4>
          <Show when={currentTerminalOffer()} fallback={
            <p class={`mt-2 text-sm ${props.panelProps.terminalOfferState?.state === "error" ? "text-rose-200" : "text-amber-200"}`}>
              {props.panelProps.terminalOfferState?.terminalId === props.selected.id
                ? props.panelProps.terminalOfferState.message
                : "No current offer was returned by the CS2 Game Coordinator."}
            </p>
          }>
            {(offer) => (
              <>
                <div class="mt-3 flex items-center gap-3">
                  <Show when={offer().item.imageUrl} fallback={<div class="grid h-20 w-24 place-items-center rounded-xl bg-slate-950 text-slate-600">?</div>}>
                    {(imageUrl) => <img class="h-20 w-24 rounded-xl bg-slate-950 object-contain" src={imageUrl()} alt="" />}
                  </Show>
                  <div>
                    <p class="font-semibold text-slate-100">{offer().item.marketName || offer().item.name}</p>
                    <p class="mt-1 text-xs text-slate-400">{offer().item.rarity || "Unknown rarity"}<Show when={offer().purchasePrice}> · Embedded price {offer().purchasePrice}</Show></p>
                  </div>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button type="button" class="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-40" disabled={props.panelProps.pending || (props.selected.terminalPointsRemaining ?? 0) <= 0} onClick={rejectTerminalOffer}>Reject · Next offer</button>
                  <Show when={!confirmTerminalPurchase()} fallback={
                    <>
                      <button type="button" class="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={props.panelProps.pending || !offer().purchasePrice} onClick={() => void purchaseTerminalOffer()}>Confirm purchase from Steam Wallet</button>
                      <button type="button" class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" onClick={() => setConfirmTerminalPurchase(false)}>Cancel</button>
                    </>
                  }>
                    <button type="button" class="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" disabled={props.panelProps.pending} onClick={() => setConfirmTerminalPurchase(true)}>Buy this offer</button>
                  </Show>
                </div>
                <Show when={confirmTerminalPurchase()}><p class="mt-2 text-xs text-amber-200">This is a real purchase and may charge your Steam Wallet. Confirm only if the item shown above is the offer you intend to buy.</p></Show>
                <Show when={terminalPurchaseMessage()}><p class="mt-2 text-xs text-slate-300">{terminalPurchaseMessage()}</p></Show>
                <Show when={props.panelProps.containerStatusMessage}><p class="mt-2 text-xs text-slate-300">{props.panelProps.containerStatusMessage}</p></Show>
              </>
            )}
          </Show>
        </section>
      </Show>
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
  const [selectedPriceScan, setSelectedPriceScan] = createSignal<PriceScanResult>();
  const [selectedPriceScanLoading, setSelectedPriceScanLoading] = createSignal(false);
  const [tradeUpPreview, setTradeUpPreview] = createSignal<{ result: RevealItem; ready: boolean; candidates: RevealItem[] }>();
  const [tradeUpReturn, setTradeUpReturn] = createSignal<ReturnEstimate>();
  const [tradeUpReturnLoading, setTradeUpReturnLoading] = createSignal(false);
  const [containerReturn, setContainerReturn] = createSignal<ReturnEstimate>();
  const [containerReturnLoading, setContainerReturnLoading] = createSignal(false);
  let tradeUpPreviewTimer: number | undefined;
  let requestedMarketName = "";
  let requestedPriceName = "";
  let requestedTradeUpReturn = "";

  const clearTradeUpPreviewTimer = () => {
    if (tradeUpPreviewTimer !== undefined) window.clearTimeout(tradeUpPreviewTimer);
    tradeUpPreviewTimer = undefined;
  };
  onCleanup(clearTradeUpPreviewTimer);

  const previewTradeUp = (item: InventoryItemDto) => {
    const candidates = (item.tradeUpItems ?? []).map((outcome): RevealItem => ({
      name: outcome.marketName || outcome.name,
      marketName: outcome.marketName,
      price: outcome.price,
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
    const immediate = mode === "none" || mode === "contract-none";
    setTradeUpPreview({ result: immediate ? randomRevealCandidate(candidates, fallback) : fallback, ready: immediate, candidates });
    const marketNames = [...new Set(candidates.map((candidate) => candidate.marketName).filter((name): name is string => !!name))];
    if (marketNames.length > 0) {
      void props.onScanPrices(marketNames, 730).then((scan) => {
        if (!scan) return;
        const prices = new Map(scan.items.flatMap((entry) => {
          const quote = entry.quotes.find((candidate) => candidate.source === "steam") ?? entry.quotes[0];
          const price = quote?.adjustedDisplayPrice || quote?.displayPrice;
          return price ? [[entry.marketName, price] as const] : [];
        }));
        setTradeUpPreview((current) => current ? {
          ...current,
          result: { ...current.result, price: current.result.marketName ? prices.get(current.result.marketName) ?? current.result.price : current.result.price },
          candidates: current.candidates.map((candidate) => ({ ...candidate, price: candidate.marketName ? prices.get(candidate.marketName) ?? candidate.price : candidate.price })),
        } : current);
      });
    }
    if (immediate) return;
    tradeUpPreviewTimer = window.setTimeout(() => {
      setTradeUpPreview((current) => current ? { ...current, result: randomRevealCandidate(current.candidates, current.candidates[0] ?? fallback), ready: true } : current);
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

  createEffect(() => {
    const item = props.selectedItem;
    const outcomes = item?.tradeUpItems ?? [];
    const names = [...new Set([item?.marketName, ...outcomes.map((outcome) => outcome.marketName)].filter((name): name is string => !!name))];
    const requestKey = `${item?.id ?? ""}\u0000${names.join("\u0000")}`;
    if (!item || item.kind !== "weapon_skin" || outcomes.length === 0 || names.length === 0) {
      requestedTradeUpReturn = "";
      setTradeUpReturn(undefined);
      setTradeUpReturnLoading(false);
      return;
    }
    if (requestKey === requestedTradeUpReturn) return;
    requestedTradeUpReturn = requestKey;
    setTradeUpReturn(undefined);
    setTradeUpReturnLoading(true);
    void scanPriceMap(names, props.onScanPrices).then((prices) => {
      if (requestedTradeUpReturn !== requestKey) return;
      const inputPrice = prices.get(item.marketName ?? "");
      setTradeUpReturn(expectedReturn(outcomes.map((outcome) => ({ marketName: outcome.marketName, probability: 1 / outcomes.length })), prices, inputPrice === undefined ? undefined : inputPrice * tradeUpInputCount(item)));
      setTradeUpReturnLoading(false);
    });
  });

  createEffect(() => {
    const selected = props.selectedItem;
    const marketName = selected?.marketName ?? "";
    if (!marketName) {
      requestedPriceName = "";
      setSelectedPriceScan(undefined);
      setSelectedPriceScanLoading(false);
      return;
    }
    if (requestedPriceName === marketName) return;
    requestedPriceName = marketName;
    setSelectedPriceScan(undefined);
    setSelectedPriceScanLoading(true);
    void props.onScanPrices([marketName], 730).then((result) => {
      if (requestedPriceName === marketName) {
        setSelectedPriceScan(result);
        setSelectedPriceScanLoading(false);
      }
    });
  });

  const contentsOdds = () => containerItemOdds(contentsDialog()?.items ?? []);
  const contentsDescription = "Opening odds, prices, and generated wear outcomes";
  const detailsPanelProps = mergeProps(props, {
    get selectedMarketPreview() { return selectedMarketPreview(); },
    get selectedMarketLoading() { return selectedMarketLoading(); },
    get selectedPriceScan() { return selectedPriceScan(); },
    get selectedPriceScanLoading() { return selectedPriceScanLoading(); },
    get tradeUpReturnEstimate() { return tradeUpReturn(); },
    get tradeUpReturnLoading() { return tradeUpReturnLoading(); },
    onPreviewTradeUp: previewTradeUp,
    onOpenCollection: (title: string, items: RelatedItemDto[], context: RelatedItemPreviewContext) => setContentsDialog({ title, description: "Items belonging to this collection", items, context }),
    onShowContents: () => {
      const selected = props.selectedItem;
      const items = selected?.containerItems ?? [];
      setContentsDialog({ title: itemDisplayName(selected!), description: contentsDescription, items, context: "container" });
      const odds = containerItemOdds(items);
      const names = [...new Set([...items.map((item) => item.marketName), selected?.marketName, props.compatibleContainerKey?.marketName].filter((name): name is string => !!name))];
      setContainerReturn(undefined);
      setContainerReturnLoading(names.length > 0);
      if (names.length > 0) void scanPriceMap(names, props.onScanPrices).then((selectedPrices) => {
        const containerCost = selectedPrices.get(selected?.marketName ?? "") ?? 0;
        const keyName = props.compatibleContainerKey?.marketName;
        const keyCost = keyName ? selectedPrices.get(keyName) ?? 0 : 0;
        setContainerReturn(expectedReturn(items.map((item) => ({ marketName: item.marketName, probability: odds.get(item) ?? 0 })), selectedPrices, containerCost + keyCost || undefined));
        setContainerReturnLoading(false);
      });
    },
    onViewStorageContents: async () => {
      const selected = props.selectedItem;
      if (!selected || selected.kind !== "storage_unit") return;
      await props.onLoadStorageContents(selected.id);
    },
  } satisfies Partial<InventoryDetailsPanelProps>);

  return (
    <>
      <Show when={(props.settings?.animations?.tradeUp ?? "slot-machine").startsWith("contract-")} fallback={
        <RevealAnimation open={!!tradeUpPreview()} ready={tradeUpPreview()?.ready} immediate={(props.settings?.animations?.tradeUp ?? "slot-machine") === "none"} mode={(props.settings?.animations?.tradeUp ?? "slot-machine") as "none" | "countdown" | "slot-machine"} title="Hypothetical trade-up" candidates={tradeUpPreview()?.candidates ?? []} result={tradeUpPreview()?.result ?? { name: "Trade-up result" }} returnEstimate={tradeUpReturn()} returnEstimateLoading={tradeUpReturnLoading()} returnEstimateCostLabel="Estimated inputs" onComplete={() => { clearTradeUpPreviewTimer(); setTradeUpPreview(undefined); }} />
      }>
        <TradeUpContractReveal open={!!tradeUpPreview()} ready={tradeUpPreview()?.ready} mode={props.settings?.animations?.tradeUp ?? "contract-slot-machine"} candidates={tradeUpPreview()?.candidates ?? []} result={tradeUpPreview()?.result ?? { name: "Trade-up result" }} returnEstimate={tradeUpReturn()} returnEstimateLoading={tradeUpReturnLoading()} onComplete={() => { clearTradeUpPreviewTimer(); setTradeUpPreview(undefined); }} />
      </Show>
      <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show keyed when={props.selectedItem} fallback={<p class="text-sm text-slate-400">No item selected.</p>}>
        {(selected) => <SelectedItemContent selected={selected} panelProps={detailsPanelProps} />}
          </Show>
        </div>
      </div>
      <Dialog open={!!contentsDialog()} title={contentsDialog()?.title ?? "Items"} description={contentsDialog()?.description} onOpenChange={(open) => { if (!open) setContentsDialog(undefined); }}>
        <Show when={contentsDialog()?.context === "container"}><div class="mb-3"><ReturnEstimateCard estimate={containerReturn()} loading={containerReturnLoading()} costLabel="Container + key" note="Expected value uses the displayed schema odds and available market prices; fees are excluded." /></div></Show>
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
  steamId?: string;
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
  terminalOfferState?: { terminalId: string; state: "loading" | "error"; message: string };
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: (terminalSelection?: { pointsRemaining?: number; volatileLimit?: number }) => Promise<void> | void;
  onTerminalPurchase: (input: InitializeStorePurchaseRequest) => Promise<PurchaseSession>;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onScanPrices: (marketNames: string[], appId?: number) => Promise<PriceScanResult | undefined>;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
  onSelectedContainerKeyChange: (value: string) => void;
  selectedMarketPreview?: RelatedItemDto;
  selectedMarketLoading?: boolean;
  selectedPriceScan?: PriceScanResult;
  selectedPriceScanLoading?: boolean;
  tradeUpReturnEstimate?: ReturnEstimate;
  tradeUpReturnLoading?: boolean;
  onOpenCollection?: (title: string, items: RelatedItemDto[], context: RelatedItemPreviewContext) => void;
  onShowContents?: () => void;
  onLoadStorageContents: (casketId: string) => Promise<boolean>;
  onViewStorageContents?: () => Promise<void> | void;
  onPreviewTradeUp?: (item: InventoryItemDto) => void;
}

export { InventoryDetailsPanel };
