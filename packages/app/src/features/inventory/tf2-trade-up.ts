import { createMemo, createSignal } from "solid-js";
import type { EconomyInventoryItemDto, TF2RelatedItem } from "@cs-inv-edit/contracts";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
export interface TF2TradeUpOutcome extends TF2RelatedItem {
  probability: number;
  marketName?: string;
}

const eligible = (item: EconomyInventoryItemDto): item is TF2Item =>
  item.game === "tf2" &&
  !!item.details.collection &&
  !!item.details.rarity &&
  (item.details.tradeUpItems?.length ?? 0) > 0;

function outcomes(items: TF2Item[]): TF2TradeUpOutcome[] {
  const result = new Map<string, TF2TradeUpOutcome>();
  for (const item of items) {
    const candidates = item.details.tradeUpItems ?? [];
    for (const candidate of candidates) {
      const key = String(candidate.defIndex ?? candidate.name);
      const probability = 1 / items.length / candidates.length;
      const current = result.get(key);
      if (current) current.probability += probability;
      else result.set(key, { ...candidate, marketName: candidate.name, probability });
    }
  }
  return [...result.values()].sort((left, right) =>
    right.probability - left.probability || left.name.localeCompare(right.name),
  );
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
    start: () => {
      setSelectedIds([]);
      setActive(true);
    },
    reset,
  };
}
