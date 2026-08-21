import type { RelatedItemDto } from "@cs-inv-edit/contracts";
import {
  randomRevealCandidate,
  type RevealItem,
} from "../../shared/ui/RevealAnimation.js";

export type TradeUpPreview = {
  result: RevealItem;
  ready: boolean;
  candidates: RevealItem[];
};

export function finishTradeUpPreview(
  current: TradeUpPreview | undefined,
  fallback: RevealItem,
) {
  if (!current) return current;
  return {
    ...current,
    result: randomRevealCandidate(
      current.candidates,
      current.candidates[0] ?? fallback,
    ),
    ready: true,
  };
}

export function expectedContainerItems(
  items: RelatedItemDto[],
  odds: ReadonlyMap<RelatedItemDto, number>,
) {
  return items.map((item) => ({
    marketName: item.marketName,
    probability: odds.get(item) ?? 0,
  }));
}
