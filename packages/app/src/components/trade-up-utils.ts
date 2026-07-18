import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";

export interface TradeUpOutcome extends RelatedItemDto {
  probability: number;
  predictedWear: number;
}

export interface TradeUpResolutionRequest {
  itemIds: string[];
  outcomes: TradeUpOutcome[];
}

export type TradeUpResolver = (request: TradeUpResolutionRequest) => Promise<TradeUpOutcome>;

export const resolveTradeUpLocally = (request: TradeUpResolutionRequest, random = Math.random) => {
  const roll = random();
  let cumulative = 0;
  return request.outcomes.find((outcome) => (cumulative += outcome.probability) >= roll)
    ?? request.outcomes[request.outcomes.length - 1];
};

export const tradeUpInputCount = (item: Pick<InventoryItemDto, "rarity">) =>
  item.rarity?.toLowerCase() === "covert" ? 5 : 10;

export const effectiveFloat = (item: Pick<InventoryItemDto, "paintWear" | "paintWearMin" | "paintWearMax">) => {
  const wear = item.paintWear ?? 0;
  const min = item.paintWearMin ?? 0;
  const max = item.paintWearMax ?? 1;
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (wear - min) / (max - min)));
};

export const compatibleTradeUpItem = (first: InventoryItemDto, candidate: InventoryItemDto) =>
  candidate.kind === "weapon_skin"
  && candidate.paintWear !== undefined
  && (candidate.tradeUpItems?.length ?? 0) > 0
  && candidate.rarity === first.rarity
  && candidate.isStatTrak === first.isStatTrak;

export function calculateTradeUpOutcomes(items: InventoryItemDto[]): TradeUpOutcome[] {
  if (items.length === 0) return [];
  const averageEffective = items.reduce((sum, item) => sum + effectiveFloat(item), 0) / items.length;
  const outcomes = new Map<string, TradeUpOutcome>();

  for (const input of items) {
    const candidates = input.tradeUpItems ?? [];
    if (candidates.length === 0) continue;
    for (const candidate of candidates) {
      const key = `${candidate.marketName ?? candidate.name}|${candidate.wearMin ?? 0}|${candidate.wearMax ?? 1}`;
      const min = candidate.wearMin ?? 0;
      const max = candidate.wearMax ?? 1;
      const probability = 1 / items.length / candidates.length;
      const existing = outcomes.get(key);
      if (existing) existing.probability += probability;
      else outcomes.set(key, {
        ...candidate,
        probability,
        predictedWear: min + averageEffective * (max - min),
      });
    }
  }

  return [...outcomes.values()].sort((left, right) =>
    right.probability - left.probability || (left.marketName ?? left.name).localeCompare(right.marketName ?? right.name));
}
