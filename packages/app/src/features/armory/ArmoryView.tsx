import { Show, createEffect, createSignal, onCleanup } from "solid-js";
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
import { ArmoryContentsDialog } from "./ArmoryContentsDialog.js";
import { ArmoryStatus } from "./ArmoryStatus.js";
import {
  ARMORY_PURCHASE_TIMEOUT_MS,
  ARMORY_STAR_COST_MINOR,
  armoryPurchaseRequiresConfirmation,
  armoryPurchaseUsesReveal,
  armoryRevealCandidates,
  armoryRevealResult,
  armoryRevealVariant,
  armoryPurchaseTimeoutMessage,
  isContainerOffer,
  withArmoryPurchaseTimeout,
} from "./armory-view-elements.js";
import { ArmoryOfferList } from "./armory-offer-list.js";
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
type ArmoryReveal = {
  result: RevealItem;
  ready: boolean;
  candidates: RevealItem[];
  complete: () => void;
  mode: NonNullable<SettingsData["animations"]>["armory"];
  title: string;
  immediate?: boolean;
};

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
  const [reveal, setReveal] = createSignal<ArmoryReveal>();
  const awaitReveal = (next: Omit<ArmoryReveal, "ready" | "complete">) =>
    new Promise<void>((resolve) =>
      setReveal({ ...next, ready: true, complete: resolve }),
    );
  const [contentsOffer, setContentsOffer] =
    createSignal<ArmorySnapshot["offers"][number]>();
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
            await awaitReveal({
              result: armoryRevealResult(openedItem),
              candidates,
              mode,
              title: "Armory purchase",
            });
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
        onComplete={() => {
          const current = reveal();
          setReveal(undefined);
          current?.complete();
        }}
      />
      <div class="flex w-full flex-col gap-5">
        <ArmoryStatus
          armory={props.armory}
          purchaseError={purchaseError()}
          diagnostics={diagnostics()}
        />
        <ArmoryOfferList
          offers={offers()}
          armory={props.armory}
          settings={props.settings}
          offerEstimates={offerEstimates()}
          offerEstimatesLoading={offerEstimatesLoading()}
          busy={busy()}
          confirming={confirming()}
          redemptionEnabled={redemptionEnabled()}
          ready={ready()}
          quantity={quantity}
          setQuantity={setQuantity}
          onOpenContents={setContentsOffer}
          onPreviewOpen={previewOpen}
          onConfirm={(offer) => {
            const purchaseQuantity = quantity(offer);
            const requiresConfirmation = armoryPurchaseRequiresConfirmation(
              purchaseQuantity,
              offer.expectedCost,
            );
            if (requiresConfirmation) setConfirming(armoryOfferKey(offer));
            else void redeem(offer);
          }}
          onRedeem={(offer) => void redeem(offer)}
          onCancel={() => setConfirming(undefined)}
        />
        <Show when={ready() && offers().length === 0}>
          <Alert>
            No universal Armory offers were found in the current live CS2 item
            schema.
          </Alert>
        </Show>
      </div>
      <ArmoryContentsDialog
        offer={contentsOffer()}
        onClose={() => setContentsOffer(undefined)}
        onMarketPreview={props.onMarketPreview}
      />
    </div>
  );
}
