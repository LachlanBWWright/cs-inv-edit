import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import type {
  ArmoryRedeemRequest,
  ArmorySnapshot,
  OperationReceipt,
  PriceScanResult,
  RelatedItemDto,
  SettingsData,
} from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import {
  MOCK_RESULT_DELAY_MS,
  RevealAnimation,
  generateRevealMiss,
  randomRevealCandidate,
  type RevealItem,
} from "../../shared/ui/RevealAnimation.js";
import { containerItemOdds } from "../inventory/related-item-preview-utils.js";
import {
  expectedReturn,
  scanPriceMap,
  type ReturnEstimate,
} from "../commerce/roi-utils.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { sortRelatedItemsByRarity } from "../inventory/inventory-view-utils.js";
import { RelatedItemPreview } from "../inventory/RelatedItemPreview.js";
import { InventoryLoadingState } from "../../shared/ui/InventoryLoadingState.js";
import {
  ARMORY_PURCHASE_TIMEOUT_MS,
  ARMORY_STAR_COST_MINOR,
  OfferCard,
  armoryPurchaseRequiresConfirmation,
  armoryPurchaseUsesReveal,
  armoryRevealCandidates,
  armoryRevealResult,
  armoryRevealVariant,
  armoryPurchaseTimeoutMessage,
  isContainerOffer,
  withArmoryPurchaseTimeout,
} from "./armory-view-elements.js";
import {
  armoryOfferKey,
  filterArmoryOffers,
  type CommerceSort,
} from "../commerce/commerce-view-utils.js";
export {
  ARMORY_PURCHASE_TIMEOUT_MS,
  ARMORY_STAR_COST_MINOR,
  armoryPurchaseRequiresConfirmation,
  armoryPurchaseUsesReveal,
  armoryRevealCandidates,
  armoryRevealResult,
  withArmoryPurchaseTimeout,
} from "./armory-view-elements.js";
export type { ArmoryRevealVariant } from "./armory-view-elements.js";
export function ArmoryView(props: {
  armory?: ArmorySnapshot;
  settings?: SettingsData;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt>;
  query?: string;
  categoryFilter?: string;
  sort?: CommerceSort;
}) {
  const [confirming, setConfirming] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [purchaseError, setPurchaseError] = createSignal<string>();
  const [reveal, setReveal] = createSignal<{
    result: RevealItem;
    ready: boolean;
    candidates: RevealItem[];
    complete: () => void;
    mode: NonNullable<SettingsData["animations"]>["armory"];
    title: string;
    immediate?: boolean;
  }>();
  const [contentsOffer, setContentsOffer] =
    createSignal<ArmorySnapshot["offers"][number]>();
  const [returnEstimate, setReturnEstimate] = createSignal<ReturnEstimate>();
  const [returnEstimateLoading, setReturnEstimateLoading] = createSignal(false);
  const [returnUnitCost, setReturnUnitCost] = createSignal<number>();
  const [quantities, setQuantities] = createSignal<Record<string, number>>({});
  const [offerEstimates, setOfferEstimates] = createSignal<
    Record<string, ReturnEstimate>
  >({});
  const [offerEstimatesLoading, setOfferEstimatesLoading] = createSignal(false);
  let offerEstimateRequest = 0;
  let previewResultTimer: number | undefined;
  const clearPreviewResultTimer = () => {
    if (previewResultTimer !== undefined)
      window.clearTimeout(previewResultTimer);
    previewResultTimer = undefined;
  };
  onCleanup(clearPreviewResultTimer);
  const ready = () => props.armory?.status === "ready";
  const redemptionEnabled = () =>
    props.settings?.featureFlags.enableArmoryRedemption !== false;
  const offers = () =>
    filterArmoryOffers(props.armory?.offers ?? [], {
      query: props.query ?? "",
      category: props.categoryFilter ?? "",
      sort: props.sort ?? "name",
    });
  const diagnostics = () =>
    (props.armory?.diagnostics ?? []).filter(
      (line) =>
        line !==
        "Armory balance loaded, but no purchasable bid objects were present in the GC cache",
    );
  const quantity = (offer: ArmorySnapshot["offers"][number]) =>
    quantities()[armoryOfferKey(offer)] ?? 1;
  const setQuantity = (
    offer: ArmorySnapshot["offers"][number],
    value: number,
    maximum: number,
  ) =>
    setQuantities((current) => ({
      ...current,
      [armoryOfferKey(offer)]: Math.max(1, Math.min(maximum, value)),
    }));

  createEffect(() => {
    const currentOffers = offers();
    const revision = props.armory?.refreshedAt ?? "";
    const request = ++offerEstimateRequest;
    if (!revision || currentOffers.length === 0) {
      setOfferEstimates({});
      setOfferEstimatesLoading(false);
      return;
    }
    const names = currentOffers.flatMap((offer) =>
      (offer.items ?? [])
        .map((item) => item.marketName)
        .filter((name): name is string => !!name),
    );
    setOfferEstimatesLoading(names.length > 0);
    if (names.length === 0) return;
    void scanPriceMap(names, props.onScanPrices).then((prices) => {
      if (request !== offerEstimateRequest) return;
      const estimates: Record<string, ReturnEstimate> = {};
      for (const offer of currentOffers) {
        const items = offer.items ?? [];
        const odds = containerItemOdds(items);
        estimates[armoryOfferKey(offer)] = expectedReturn(
          items.map((item) => ({
            marketName: item.marketName,
            probability: odds.get(item) ?? 0,
          })),
          prices,
          offer.expectedCost * ARMORY_STAR_COST_MINOR,
        );
      }
      setOfferEstimates(estimates);
      setOfferEstimatesLoading(false);
    });
  });

  const redeem = async (offer: ArmorySnapshot["offers"][number]) => {
    const state = props.armory;
    if (!state || state.status !== "ready") return;
    clearPreviewResultTimer();
    setBusy(true);
    setReturnEstimate(undefined);
    setReturnEstimateLoading(false);
    setReturnUnitCost(undefined);
    setPurchaseError(undefined);
    const uiDeadline = globalThis.setTimeout(() => {
      const currentReveal = reveal();
      setReveal(undefined);
      currentReveal?.complete();
      setConfirming(undefined);
      setBusy(false);
      setPurchaseError(armoryPurchaseTimeoutMessage);
    }, ARMORY_PURCHASE_TIMEOUT_MS);
    const purchaseQuantity = quantity(offer);
    const mode = isContainerOffer(offer)
      ? (props.settings?.animations?.container ?? "slot-machine")
      : (props.settings?.animations?.armory ?? "slot-machine");
    const candidates = armoryRevealCandidates(
      offer.items ?? [],
      armoryRevealVariant(offer),
    );
    const usesReveal =
      purchaseQuantity === 1 &&
      mode !== "none" &&
      armoryPurchaseUsesReveal(offer);
    if (usesReveal)
      setReveal({
        result: candidates[0] ?? { name: "Awaiting reward…" },
        ready: false,
        candidates,
        complete: () => undefined,
        mode,
        title: "Armory purchase",
      });
    await fromAppPromise(
      withArmoryPurchaseTimeout(
        props.onRedeem({
          campaignId: offer.campaignId,
          redeemId: offer.redeemId,
          expectedCost: offer.expectedCost,
          redeemableBalance: state.balance,
          generationTime: state.generationTime,
          quantity: purchaseQuantity,
        }),
      ),
      "Armory purchase failed",
    ).match(
      async (receipt) => {
        if (usesReveal) {
          const openedItem = receipt.result?.openedItem;
          if (receipt.state === "completed" && openedItem) {
            await new Promise<void>((resolve) =>
              setReveal({
                result: armoryRevealResult(openedItem),
                ready: true,
                candidates,
                complete: resolve,
                mode,
                title: "Armory purchase",
              }),
            );
          } else {
            setReveal(undefined);
          }
        }
        if (receipt.state === "failed")
          setPurchaseError(receipt.message ?? "Armory purchase failed");
        setConfirming(undefined);
      },
      (error) => {
        setReveal(undefined);
        setConfirming(undefined);
        setPurchaseError(appErrorMessage(error, "Armory purchase failed"));
      },
    );
    globalThis.clearTimeout(uiDeadline);
    setBusy(false);
  };

  const previewOpen = (offer: ArmorySnapshot["offers"][number]) => {
    const candidates = armoryRevealCandidates(
      offer.items ?? [],
      armoryRevealVariant(offer),
    );
    if (candidates.length === 0) return;
    const mode = isContainerOffer(offer)
      ? (props.settings?.animations?.container ?? "slot-machine")
      : (props.settings?.animations?.armory ?? "slot-machine");
    const fallback = candidates[0]!;
    const title = `Preview opening · ${offer.name || offer.itemName || "Armory reward"}`;
    clearPreviewResultTimer();
    setReveal({
      result: fallback,
      ready: false,
      candidates,
      complete: () => undefined,
      mode,
      immediate: mode === "none",
      title,
    });
    const marketNames = [
      ...new Set(
        candidates
          .map((candidate) => candidate.marketName)
          .filter((name): name is string => !!name),
      ),
    ];
    setReturnEstimate(undefined);
    setReturnUnitCost(offer.expectedCost);
    setReturnEstimateLoading(marketNames.length > 0);
    if (marketNames.length > 0)
      void scanPriceMap(marketNames, props.onScanPrices).then((prices) => {
        const odds = containerItemOdds(offer.items ?? []);
        setReturnEstimate(
          expectedReturn(
            (offer.items ?? []).map((item) => ({
              marketName: item.marketName,
              probability: odds.get(item) ?? 0,
            })),
            prices,
            offer.expectedCost * ARMORY_STAR_COST_MINOR,
          ),
        );
        setReturnEstimateLoading(false);
      });
    previewResultTimer = window.setTimeout(() => {
      const result = generateRevealMiss(
        randomRevealCandidate(candidates, fallback),
      );
      setReveal((current) =>
        current?.title === title
          ? { ...current, result, ready: true }
          : current,
      );
      previewResultTimer = undefined;
    }, MOCK_RESULT_DELAY_MS);
  };

  return (
    <div class="flex-1">
      <RevealAnimation
        open={!!reveal()}
        ready={reveal()?.ready}
        mode={reveal()?.mode ?? "none"}
        immediate={reveal()?.immediate}
        title={reveal()?.title ?? "Armory preview"}
        candidates={reveal()?.candidates ?? []}
        result={reveal()?.result ?? { name: "Armory reward" }}
        returnEstimate={returnEstimate()}
        returnEstimateLoading={returnEstimateLoading()}
        returnEstimateCostLabel="Stars at USD 0.40 each"
        returnEstimateUnitCost={returnUnitCost()}
        returnEstimateNote="Expected value uses current market prices and treats each Armory star as costing USD 0.40; Steam fees are excluded."
        onComplete={() => {
          const current = reveal();
          setReveal(undefined);
          current?.complete();
        }}
      />
      <div class="flex w-full flex-col gap-5">
        <Show when={ready()}>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xl font-semibold leading-none">
              {props.armory?.balance ?? 0} stars
            </p>
          </div>
        </Show>
        <Show
          when={
            (!props.armory || props.armory.status === "loading") &&
            (props.armory?.offers.length ?? 0) === 0
          }
        >
          <InventoryLoadingState
            active={!props.armory || props.armory.status === "loading"}
            title="Loading CS2 Armory"
            currentStage={props.armory?.message}
            variant="catalog"
          />
        </Show>
        <Show when={props.armory?.status === "requires_connection"}>
          <Alert variant="warning">
            Connect and refresh inventory before loading Armory state.
          </Alert>
        </Show>
        <Show when={props.armory?.status === "error"}>
          <Alert variant="danger">{props.armory?.message}</Alert>
        </Show>
        <Show when={purchaseError()}>
          {(message) => <Alert variant="danger">{message()}</Alert>}
        </Show>
        <For each={diagnostics()}>
          {(line) => <Alert variant="warning">{line}</Alert>}
        </For>
        <div class="grid w-full gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <For each={offers()}>
            {(offer) => {
              const affordable = () =>
                offer.expectedCost * quantity(offer) <=
                (props.armory?.balance ?? 0);
              const disabledReason = () =>
                !redemptionEnabled()
                  ? "Armory redemption is disabled. Enable it in Settings → Feature flags to buy this reward."
                  : !ready()
                    ? "Refresh the Armory and wait for a current GC balance before buying."
                    : !affordable()
                      ? `You need ${offer.expectedCost * quantity(offer) - (props.armory?.balance ?? 0)} more stars for this purchase.`
                      : undefined;
              const purchaseQuantity = quantity(offer);
              const requiresConfirmation = armoryPurchaseRequiresConfirmation(
                purchaseQuantity,
                offer.expectedCost,
              );
              return (
                <OfferCard
                  offer={offer}
                  quantity={purchaseQuantity}
                  estimate={offerEstimates()[armoryOfferKey(offer)]}
                  estimateLoading={offerEstimatesLoading()}
                  canBuy={redemptionEnabled() && ready() && affordable()}
                  buyDisabledReason={disabledReason()}
                  busy={busy()}
                  balance={props.armory?.balance ?? 0}
                  onOpenContents={() => setContentsOffer(offer)}
                  onPreviewOpen={() => previewOpen(offer)}
                  onSetQuantity={(value) =>
                    setQuantity(
                      offer,
                      value,
                      Math.floor(
                        (props.armory?.balance ?? 0) / offer.expectedCost,
                      ),
                    )
                  }
                  onConfirm={() => {
                    if (requiresConfirmation)
                      setConfirming(armoryOfferKey(offer));
                    else void redeem(offer);
                  }}
                  onRedeem={() => void redeem(offer)}
                  onCancel={() => setConfirming(undefined)}
                  confirming={confirming() === armoryOfferKey(offer)}
                />
              );
            }}
          </For>
        </div>
        <Show when={ready() && offers().length === 0}>
          <Alert>
            No universal Armory offers were found in the current live CS2 item
            schema.
          </Alert>
        </Show>
      </div>
      <Dialog
        open={!!contentsOffer()}
        title={contentsOffer()?.name || "Armory collection"}
        description="Possible items available from this Armory offer"
        onOpenChange={(open) => {
          if (!open) setContentsOffer(undefined);
        }}
      >
        <Show
          when={(contentsOffer()?.items?.length ?? 0) > 0}
          fallback={
            <p class="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
              No item contents were found in the current CS2 schema.
            </p>
          }
        >
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={sortRelatedItemsByRarity(contentsOffer()?.items ?? [])}>
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
    </div>
  );
}
