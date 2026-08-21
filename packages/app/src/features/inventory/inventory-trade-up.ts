import { createMemo, createSignal } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import {
  calculateTradeUpOutcomes,
  compatibleTradeUpItem,
  tradeUpInputCount,
} from "../tools/trade-up-utils.js";

const isEligibleInput = (item: InventoryItemDto) =>
  item.kind === "weapon_skin" &&
  item.paintWear !== undefined &&
  (item.tradeUpItems?.length ?? 0) > 0 &&
  !item.isSouvenir &&
  !item.casketId;

export function createInventoryTradeUp(allItems: () => InventoryItemDto[]) {
  const [active, setActive] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [confirmationOpen, setConfirmationOpen] = createSignal(false);
  const selectedItems = createMemo(() => {
    const wanted = new Set(selectedIds());
    return allItems().filter((item) => wanted.has(item.id));
  });
  const first = createMemo(() => selectedItems()[0]);
  const requiredCount = createMemo(() =>
    first() ? tradeUpInputCount(first()!) : 10,
  );
  const filterItems = (items: InventoryItemDto[]) => {
    if (!active()) return items;
    const initial = first();
    return items.filter((item) =>
      initial
        ? isEligibleInput(item) && compatibleTradeUpItem(initial, item)
        : isEligibleInput(item),
    );
  };
  const toggle = (item: InventoryItemDto) => {
    setSelectedIds((current) => {
      if (current.includes(item.id))
        return current.filter((id) => id !== item.id);
      if (current.length >= requiredCount()) return current;
      return [...current, item.id];
    });
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
    requiredCount,
    outcomes: createMemo(() => calculateTradeUpOutcomes(selectedItems())),
    confirmationOpen,
    setConfirmationOpen,
    filterItems,
    toggle,
    start: () => {
      setSelectedIds([]);
      setActive(true);
    },
    reset,
  };
}
