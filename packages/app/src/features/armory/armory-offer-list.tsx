import { For } from "solid-js";
import type { ArmorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
import { armoryOfferKey } from "../commerce/commerce-view-utils.js";
import type { ReturnEstimate } from "../commerce/roi-utils.js";
import {
  OfferCard,
  armoryPurchaseRequiresConfirmation,
} from "./armory-view-elements.js";

export interface ArmoryOfferListProps {
  offers: ArmorySnapshot["offers"];
  armory: ArmorySnapshot | undefined;
  settings: SettingsData | undefined;
  offerEstimates: Record<string, ReturnEstimate>;
  offerEstimatesLoading: boolean;
  busy: boolean;
  confirming: string | undefined;
  redemptionEnabled: boolean;
  ready: boolean;
  quantity: (offer: ArmorySnapshot["offers"][number]) => number;
  setQuantity: (
    offer: ArmorySnapshot["offers"][number],
    value: number,
    maximum: number,
  ) => void;
  onOpenContents: (offer: ArmorySnapshot["offers"][number]) => void;
  onPreviewOpen: (offer: ArmorySnapshot["offers"][number]) => void;
  onConfirm: (offer: ArmorySnapshot["offers"][number]) => void;
  onRedeem: (offer: ArmorySnapshot["offers"][number]) => void;
  onCancel: () => void;
}

type ArmoryOffer = ArmorySnapshot["offers"][number];

function purchaseDisabledReason(
  props: ArmoryOfferListProps,
  offer: ArmoryOffer,
  affordable: boolean,
) {
  if (!props.redemptionEnabled)
    return "Armory redemption is disabled. Enable it in Settings → Feature flags to buy this reward.";
  if (!props.ready)
    return "Refresh the Armory and wait for a current GC balance before buying.";
  if (affordable) return undefined;
  const missing =
    offer.expectedCost * props.quantity(offer) - (props.armory?.balance ?? 0);
  return `You need ${missing} more stars for this purchase.`;
}

function ArmoryOfferEntry(props: {
  offer: ArmoryOffer;
  list: ArmoryOfferListProps;
}) {
  const quantity = () => props.list.quantity(props.offer);
  const balance = () => props.list.armory?.balance ?? 0;
  const affordable = () => props.offer.expectedCost * quantity() <= balance();
  const maximum = () => Math.floor(balance() / props.offer.expectedCost);
  const confirm = () => {
    if (
      armoryPurchaseRequiresConfirmation(quantity(), props.offer.expectedCost)
    )
      props.list.onConfirm(props.offer);
    else props.list.onRedeem(props.offer);
  };
  return (
    <OfferCard
      offer={props.offer}
      quantity={quantity()}
      estimate={props.list.offerEstimates[armoryOfferKey(props.offer)]}
      estimateLoading={props.list.offerEstimatesLoading}
      canBuy={props.list.redemptionEnabled && props.list.ready && affordable()}
      buyDisabledReason={purchaseDisabledReason(
        props.list,
        props.offer,
        affordable(),
      )}
      busy={props.list.busy}
      balance={balance()}
      onOpenContents={() => props.list.onOpenContents(props.offer)}
      onPreviewOpen={() => props.list.onPreviewOpen(props.offer)}
      onSetQuantity={(value) =>
        props.list.setQuantity(props.offer, value, maximum())
      }
      onConfirm={confirm}
      onRedeem={() => props.list.onRedeem(props.offer)}
      onCancel={props.list.onCancel}
      confirming={props.list.confirming === armoryOfferKey(props.offer)}
    />
  );
}

export function ArmoryOfferList(props: ArmoryOfferListProps) {
  return (
    <div class="grid w-full gap-4 md:grid-cols-2 2xl:grid-cols-3">
      <For each={props.offers}>
        {(offer) => <ArmoryOfferEntry offer={offer} list={props} />}
      </For>
    </div>
  );
}
