import { createMemo, createSignal } from "solid-js";
import type { EconomyInventoryItemDto, TF2RelatedItem } from "@cs-inv-edit/contracts";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
export interface TF2TradeUpOutcome extends TF2RelatedItem {
  probability: number;
  collectionProbability?: number;
  marketName?: string;
}

export interface TF2TradeUpCollectionBreakdown {
  collection: string;
  probability: number;
  rarity?: string;
  outcomeCount: number;
}

const eligible = (item: EconomyInventoryItemDto): item is TF2Item =>
  item.game === "tf2" &&
  !!item.details.collection &&
  !!item.details.rarity &&
  (item.details.tradeUpItems?.length ?? 0) > 0;

function outcomes(items: TF2Item[]): TF2TradeUpOutcome[] {
  const result = new Map<string, TF2TradeUpOutcome>();
  const collectionCounts = new Map<string, number>();
  for (const item of items) {
    const collection = item.details.collection ?? "Unknown collection";
    collectionCounts.set(collection, (collectionCounts.get(collection) ?? 0) + 1);
  }
  for (const item of items) {
    const candidates = item.details.tradeUpItems ?? [];
    const collection = item.details.collection ?? "Unknown collection";
    const collectionProbability = (collectionCounts.get(collection) ?? 0) / items.length;
    for (const candidate of candidates) {
      const key = `${candidate.collection || collection}:${String(candidate.defIndex ?? candidate.name)}`;
      const probability = 1 / items.length / candidates.length;
      const current = result.get(key);
      if (current) {
        current.probability += probability;
        current.collectionProbability = Math.max(current.collectionProbability ?? 0, collectionProbability);
      } else {
        result.set(key, { ...candidate, collection: candidate.collection || collection, marketName: candidate.name, probability, collectionProbability });
      }
    }
  }
  return [...result.values()].sort((left, right) =>
    right.probability - left.probability || left.name.localeCompare(right.name),
  );
}

function collectionBreakdown(items: TF2Item[]): TF2TradeUpCollectionBreakdown[] {
  const groups = new Map<string, TF2TradeUpCollectionBreakdown>();
  for (const item of items) {
    const collection = item.details.collection ?? "Unknown collection";
    const existing = groups.get(collection);
    if (existing) {
      existing.probability += 1 / items.length;
      continue;
    }
    groups.set(collection, {
      collection,
      probability: 1 / items.length,
      rarity: item.details.tradeUpItems?.[0]?.rarity,
      outcomeCount: item.details.tradeUpItems?.length ?? 0,
    });
  }
  return [...groups.values()].sort((left, right) => right.probability - left.probability);
}

export function createTF2TradeUp(allItems: () => EconomyInventoryItemDto[]) {
  const [active, setActive] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [confirmationOpen, setConfirmationOpen] = createSignal(false);
  const selectedItems = createMemo(() => {
    const wanted = new Set(selectedIds());
    return allItems().filter(eligible).filter((item) => wanted.has(item.assetId));
  });
  const filterItems = (items: EconomyInventoryItemDto[]) => {
    if (!active()) return items;
    const first = selectedItems()[0];
    return items.filter(
      (item) =>
        eligible(item) &&
        (!first ||
          (item.details.rarity === first.details.rarity &&
            item.quality === first.quality)),
    );
  };
  const toggle = (item: EconomyInventoryItemDto) => {
    if (!eligible(item)) return;
    setSelectedIds((current) =>
      current.includes(item.assetId)
        ? current.filter((id) => id !== item.assetId)
        : current.length < 10
          ? [...current, item.assetId]
          : current,
    );
  };
  const reset = () => {
    setActive(false);
    setSelectedIds([]);
    setConfirmationOpen(false);
  };
  return {
    active,
    selectedIds,
    selectedItems,
    confirmationOpen,
    setConfirmationOpen,
    filterItems,
    toggle,
    outcomes: createMemo(() => outcomes(selectedItems())),
    collectionBreakdown: createMemo(() => collectionBreakdown(selectedItems())),
    start: () => {
      setSelectedIds([]);
      setActive(true);
    },
    reset,
  };
}
