import type { RelatedItemDto } from "@cs-inv-edit/contracts";

const rarityRanks: Record<string, number> = {
  common: 1,
  "consumer grade": 1,
  "base grade": 1,
  uncommon: 2,
  "industrial grade": 2,
  "medium grade": 2,
  rare: 3,
  "mil-spec": 3,
  "mil-spec grade": 3,
  "high grade": 3,
  distinguished: 3,
  mythical: 4,
  restricted: 4,
  remarkable: 4,
  exceptional: 4,
  legendary: 5,
  classified: 5,
  exotic: 5,
  superior: 5,
  ancient: 6,
  covert: 6,
  extraordinary: 6,
  master: 6,
  "exceedingly rare": 7,
  "rare special (★)": 7,
  "rare special item": 7,
  knife: 7,
  gloves: 7,
  unusual: 7,
  immortal: 8,
  "contraband (discontinued)": 8,
  clandestine: 8,
};

const generatedWearBrackets = [
  { name: "Factory New", min: 0, max: 0.07, probability: 0.03 },
  { name: "Minimal Wear", min: 0.07, max: 0.15, probability: 0.24 },
  { name: "Field-Tested", min: 0.15, max: 0.38, probability: 0.33 },
  { name: "Well-Worn", min: 0.38, max: 0.45, probability: 0.24 },
  { name: "Battle-Scarred", min: 0.45, max: 1, probability: 0.16 },
] as const;

export function rarityRank(rarity?: string) {
  return rarityRanks[(rarity ?? "").trim().toLowerCase()] ?? 0;
}

export function containerItemOdds(items: RelatedItemDto[]) {
  const tierCounts = new Map<number, number>();
  for (const item of items) {
    const rank = rarityRank(item.rarity);
    if (rank > 0) tierCounts.set(rank, (tierCounts.get(rank) ?? 0) + 1);
  }
  const ranks = [...tierCounts.keys()].sort((a, b) => a - b);
  const highest = ranks.at(-1) ?? 0;
  const tierWeights = new Map(
    ranks.map((rank) => [rank, 5 ** (highest - rank)]),
  );
  const totalWeight = [...tierWeights.values()].reduce(
    (sum, weight) => sum + weight,
    0,
  );

  return new Map(
    items.map((item) => {
      const rank = rarityRank(item.rarity);
      const count = tierCounts.get(rank) ?? 0;
      const probability =
        count > 0 && totalWeight > 0
          ? (tierWeights.get(rank) ?? 0) / totalWeight / count
          : 0;
      return [item, probability];
    }),
  );
}

export function weightedRandomItem<T extends { rarity?: string }>(
  items: T[],
  random = Math.random,
) {
  if (items.length === 0) return undefined;
  const tiers = new Map<number, T[]>();
  for (const item of items) {
    const rank = rarityRank(item.rarity);
    const tier = tiers.get(rank) ?? [];
    tier.push(item);
    tiers.set(rank, tier);
  }
  const ranks = [...tiers.keys()].sort((left, right) => left - right);
  const highestRank = ranks.at(-1) ?? 0;
  const weightedTiers = ranks.map((rank) => ({
    rank,
    weight: 5 ** (highestRank - rank),
  }));
  const totalWeight = weightedTiers.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = random() * totalWeight;
  const selectedTier =
    weightedTiers.find((tier) => {
      roll -= tier.weight;
      return roll < 0;
    }) ?? weightedTiers.at(-1);
  const tierItems = tiers.get(selectedTier?.rank ?? 0) ?? items;
  return tierItems[
    Math.min(tierItems.length - 1, Math.floor(random() * tierItems.length))
  ];
}

export function generateCappedWear(
  wearMin = 0,
  wearMax = 1,
  random = Math.random,
) {
  const roll = random();
  let cumulative = 0;
  const bracket =
    generatedWearBrackets.find((entry) => {
      cumulative += entry.probability;
      return roll < cumulative;
    }) ?? generatedWearBrackets.at(-1)!;
  const generated = bracket.min + random() * (bracket.max - bracket.min);
  const min = Math.max(0, Math.min(1, wearMin));
  const max = Math.max(min, Math.min(1, wearMax));
  return generated * (max - min) + min;
}

export function cappedWearDistribution(wearMin = 0, wearMax = 1) {
  const min = Math.max(0, Math.min(1, wearMin));
  const max = Math.max(min, Math.min(1, wearMax));
  const scale = max - min;
  return generatedWearBrackets
    .map((visible) => {
      if (scale === 0) {
        return {
          name: visible.name,
          probability: min >= visible.min && min <= visible.max ? 1 : 0,
        };
      }
      const sourceMin = Math.max(0, (visible.min - min) / scale);
      const sourceMax = Math.min(1, (visible.max - min) / scale);
      let probability = 0;
      if (sourceMax > sourceMin) {
        for (const generated of generatedWearBrackets) {
          const overlap = Math.max(
            0,
            Math.min(sourceMax, generated.max) -
              Math.max(sourceMin, generated.min),
          );
          if (overlap > 0)
            probability +=
              (generated.probability * overlap) /
              (generated.max - generated.min);
        }
      }
      return { name: visible.name, probability };
    })
    .filter((entry) => entry.probability > 0.0000001);
}

export function isWeaponFinish(item: RelatedItemDto) {
  return (
    item.kind === "weapon_skin" ||
    item.wearMin !== undefined ||
    item.wearMax !== undefined
  );
}

export function steamMarketUrl(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

export function steamMarketSearchUrl(marketName: string) {
  return `https://steamcommunity.com/market/search?appid=730&q=${encodeURIComponent(marketName)}`;
}

export function formatProbability(probability: number) {
  if (probability <= 0) return "Unknown";
  const percent = probability * 100;
  if (percent < 0.01) return `${percent.toFixed(3)}%`;
  if (percent < 1) return `${percent.toFixed(2)}%`;
  return `${percent.toFixed(1)}%`;
}
