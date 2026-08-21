import type { ArmorySnapshot, StoreSnapshot } from "@cs-inv-edit/contracts";

import type { InventorySort } from "../../shared/ui-types.js";

export type CommerceSort = Extract<InventorySort, "name" | "price-low" | "price-high">;

export interface CommerceFilters {
  query: string;
  category: string;
  sort: CommerceSort;
}

export function armoryOfferKey(
  offer: Pick<ArmorySnapshot["offers"][number], "campaignId" | "redeemId">,
) {
  return `${offer.campaignId}:${offer.redeemId}`;
}

const normalized = (value: string | undefined) =>
  (value ?? "").trim().toLocaleLowerCase();

export function filterStoreOffers(
  offers: StoreSnapshot["offers"],
  filters: CommerceFilters,
) {
  const query = normalized(filters.query);
  const category = normalized(filters.category);
  return [...offers]
    .filter(
      (offer) =>
        (!query ||
          [offer.name, offer.description, offer.category, offer.rarity].some(
            (value) => normalized(value).includes(query),
          )) &&
        (!category || normalized(offer.category) === category),
    )
    .sort((left, right) => {
      if (filters.sort === "price-low")
        return storePrice(left) - storePrice(right);
      if (filters.sort === "price-high")
        return storePrice(right) - storePrice(left);
      return left.name.localeCompare(right.name);
    });
}

export function filterArmoryOffers(
  offers: ArmorySnapshot["offers"],
  filters: CommerceFilters,
) {
  const query = normalized(filters.query);
  const category = normalized(filters.category);
  return [...offers]
    .filter((offer) => {
      const itemText = (offer.items ?? [])
        .flatMap((item) => [item.name, item.marketName, item.kind, item.rarity])
        .join(" ");
      const offerCategory = armoryOfferCategory(offer);
      return (
        (!query || normalized(`${offer.name} ${itemText}`).includes(query)) &&
        (!category || normalized(offerCategory) === category)
      );
    })
    .sort((left, right) => {
      if (filters.sort === "price-low")
        return left.expectedCost - right.expectedCost;
      if (filters.sort === "price-high")
        return right.expectedCost - left.expectedCost;
      return (left.name || "Armory reward").localeCompare(
        right.name || "Armory reward",
      );
    });
}

export function armoryOfferCategory(offer: ArmorySnapshot["offers"][number]) {
  return offer.items?.[0]?.kind || offer.items?.[0]?.rarity || "Reward";
}

const storePrice = (offer: StoreSnapshot["offers"][number]) =>
  offer.saleAmountMinor ?? offer.amountMinor;
