import {
  createEffect,
  createSignal,
  mergeProps,
  onCleanup,
  Show,
} from "solid-js";
import type {
  InventoryItemDto,
  PriceScanResult,
  RelatedItemDto,
} from "@cs-inv-edit/contracts";
import {
  type RelatedItemPreviewContext,
} from "./RelatedItemPreview.js";
import { containerItemOdds } from "./related-item-preview-utils.js";
import { itemDisplayName } from "./inventory-view-utils.js";
import { TradeUpContractReveal } from "./ui/TradeUpContractReveal.js";
import {
  MOCK_RESULT_DELAY_MS,
  randomRevealCandidate,
  RevealAnimation,
  type RevealItem,
} from "./ui/RevealAnimation.js";
import {
  expectedReturn,
  scanPriceMap,
  type ReturnEstimate,
} from "./roi-utils.js";
import { tradeUpInputCount } from "./trade-up-utils.js";
import { SelectedItemContent } from "./inventory-selected-item-content.js";
import { InventoryDetailsDialogs } from "./inventory-details-dialogs.js";
import type { InventoryDetailsPanelProps } from "./inventory-details-panel-props.js";

function InventoryDetailsPanel(props: InventoryDetailsPanelProps) {
  const [contentsDialog, setContentsDialog] = createSignal<{
    title: string;
    description: string;
    items: RelatedItemDto[];
    context: RelatedItemPreviewContext;
  }>();
  const [nestedCollection, setNestedCollection] =
    createSignal<RelatedItemDto>();
  const [selectedMarketPreview, setSelectedMarketPreview] =
    createSignal<RelatedItemDto>();
  const [selectedMarketLoading, setSelectedMarketLoading] = createSignal(false);
  const [selectedPriceScan, setSelectedPriceScan] =
    createSignal<PriceScanResult>();
  const [selectedPriceScanLoading, setSelectedPriceScanLoading] =
    createSignal(false);
  const [tradeUpPreview, setTradeUpPreview] = createSignal<{
    result: RevealItem;
    ready: boolean;
    candidates: RevealItem[];
  }>();
  const [tradeUpReturn, setTradeUpReturn] = createSignal<ReturnEstimate>();
  const [tradeUpReturnLoading, setTradeUpReturnLoading] = createSignal(false);
  const [containerReturn, setContainerReturn] = createSignal<ReturnEstimate>();
  const [containerReturnLoading, setContainerReturnLoading] =
    createSignal(false);
  let tradeUpPreviewTimer: number | undefined;
  let requestedMarketName = "";
  let requestedPriceName = "";
  let requestedTradeUpReturn = "";

  const clearTradeUpPreviewTimer = () => {
    if (tradeUpPreviewTimer !== undefined)
      window.clearTimeout(tradeUpPreviewTimer);
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
    setTradeUpPreview({
      result: immediate
        ? randomRevealCandidate(candidates, fallback)
        : fallback,
      ready: immediate,
      candidates,
    });
    const marketNames = [
      ...new Set(
        candidates
          .map((candidate) => candidate.marketName)
          .filter((name): name is string => !!name),
      ),
    ];
    if (marketNames.length > 0) {
      void props.onScanPrices(marketNames, 730).then((scan) => {
        if (!scan) return;
        const prices = new Map(
          scan.items.flatMap((entry) => {
            const quote =
              entry.quotes.find((candidate) => candidate.source === "steam") ??
              entry.quotes[0];
            const price = quote?.adjustedDisplayPrice || quote?.displayPrice;
            return price ? [[entry.marketName, price] as const] : [];
          }),
        );
        setTradeUpPreview((current) =>
          current
            ? {
                ...current,
                result: {
                  ...current.result,
                  price: current.result.marketName
                    ? (prices.get(current.result.marketName) ??
                      current.result.price)
                    : current.result.price,
                },
                candidates: current.candidates.map((candidate) => ({
                  ...candidate,
                  price: candidate.marketName
                    ? (prices.get(candidate.marketName) ?? candidate.price)
                    : candidate.price,
                })),
              }
            : current,
        );
      });
    }
    if (immediate) return;
    tradeUpPreviewTimer = window.setTimeout(() => {
      setTradeUpPreview((current) =>
        current
          ? {
              ...current,
              result: randomRevealCandidate(
                current.candidates,
                current.candidates[0] ?? fallback,
              ),
              ready: true,
            }
          : current,
      );
      tradeUpPreviewTimer = undefined;
    }, MOCK_RESULT_DELAY_MS);
  };

  createEffect(() => {
    const selected = props.selectedItem;
    const marketName = selected?.marketName ?? "";
    if (
      !marketName ||
      selected?.marketable === false ||
      selected?.marketPrice ||
      requestedMarketName === marketName
    )
      return;
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
    const names = [
      ...new Set(
        [
          item?.marketName,
          ...outcomes.map((outcome) => outcome.marketName),
        ].filter((name): name is string => !!name),
      ),
    ];
    const requestKey = `${item?.id ?? ""}\u0000${names.join("\u0000")}`;
    if (
      !item ||
      item.kind !== "weapon_skin" ||
      outcomes.length === 0 ||
      names.length === 0
    ) {
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
      setTradeUpReturn(
        expectedReturn(
          outcomes.map((outcome) => ({
            marketName: outcome.marketName,
            probability: 1 / outcomes.length,
          })),
          prices,
          inputPrice === undefined
            ? undefined
            : inputPrice * tradeUpInputCount(item),
        ),
      );
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
  const contentsDescription =
    "Opening odds, prices, and generated wear outcomes";
  const detailsPanelProps = mergeProps(props, {
    get selectedMarketPreview() {
      return selectedMarketPreview();
    },
    get selectedMarketLoading() {
      return selectedMarketLoading();
    },
    get selectedPriceScan() {
      return selectedPriceScan();
    },
    get selectedPriceScanLoading() {
      return selectedPriceScanLoading();
    },
    get tradeUpReturnEstimate() {
      return tradeUpReturn();
    },
    get tradeUpReturnLoading() {
      return tradeUpReturnLoading();
    },
    onPreviewTradeUp: previewTradeUp,
    onOpenCollection: (
      title: string,
      items: RelatedItemDto[],
      context: RelatedItemPreviewContext,
    ) =>
      setContentsDialog({
        title,
        description: "Items belonging to this collection",
        items,
        context,
      }),
    onShowContents: () => {
      const selected = props.selectedItem;
      const items = selected?.containerItems ?? [];
      setContentsDialog({
        title: itemDisplayName(selected!),
        description: contentsDescription,
        items,
        context: "container",
      });
      const odds = containerItemOdds(items);
      const names = [
        ...new Set(
          [
            ...items.map((item) => item.marketName),
            selected?.marketName,
            props.compatibleContainerKey?.marketName,
          ].filter((name): name is string => !!name),
        ),
      ];
      setContainerReturn(undefined);
      setContainerReturnLoading(names.length > 0);
      if (names.length > 0)
        void scanPriceMap(names, props.onScanPrices).then((selectedPrices) => {
          const containerCost =
            selectedPrices.get(selected?.marketName ?? "") ?? 0;
          const keyName = props.compatibleContainerKey?.marketName;
          const keyCost = keyName ? (selectedPrices.get(keyName) ?? 0) : 0;
          setContainerReturn(
            expectedReturn(
              items.map((item) => ({
                marketName: item.marketName,
                probability: odds.get(item) ?? 0,
              })),
              selectedPrices,
              containerCost + keyCost || undefined,
            ),
          );
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
      <Show
        when={(
          props.settings?.animations?.tradeUp ?? "slot-machine"
        ).startsWith("contract-")}
        fallback={
          <RevealAnimation
            open={!!tradeUpPreview()}
            ready={tradeUpPreview()?.ready}
            immediate={
              (props.settings?.animations?.tradeUp ?? "slot-machine") === "none"
            }
            mode={
              (props.settings?.animations?.tradeUp ?? "slot-machine") as
                "none" | "countdown" | "slot-machine"
            }
            title="Hypothetical trade-up"
            candidates={tradeUpPreview()?.candidates ?? []}
            result={tradeUpPreview()?.result ?? { name: "Trade-up result" }}
            returnEstimate={tradeUpReturn()}
            returnEstimateLoading={tradeUpReturnLoading()}
            returnEstimateCostLabel="Estimated inputs"
            onComplete={() => {
              clearTradeUpPreviewTimer();
              setTradeUpPreview(undefined);
            }}
          />
        }
      >
        <TradeUpContractReveal
          open={!!tradeUpPreview()}
          ready={tradeUpPreview()?.ready}
          mode={props.settings?.animations?.tradeUp ?? "contract-slot-machine"}
          candidates={tradeUpPreview()?.candidates ?? []}
          result={tradeUpPreview()?.result ?? { name: "Trade-up result" }}
          returnEstimate={tradeUpReturn()}
          returnEstimateLoading={tradeUpReturnLoading()}
          onComplete={() => {
            clearTradeUpPreviewTimer();
            setTradeUpPreview(undefined);
          }}
        />
      </Show>
      <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show
            keyed
            when={props.selectedItem}
            fallback={<p class="text-sm text-slate-400">No item selected.</p>}
          >
            {(selected) => (
              <SelectedItemContent
                selected={selected}
                panelProps={detailsPanelProps}
              />
            )}
          </Show>
        </div>
      </div>
      <InventoryDetailsDialogs
        contentsDialog={contentsDialog}
        setContentsDialog={setContentsDialog}
        nestedCollection={nestedCollection}
        setNestedCollection={setNestedCollection}
        containerReturn={containerReturn}
        containerReturnLoading={containerReturnLoading}
        contentsOdds={contentsOdds}
        onMarketPreview={props.onMarketPreview}
      />
    </>
  );
}

export type { InventoryDetailsPanelProps } from "./inventory-details-panel-props.js";

export { InventoryDetailsPanel };
