import { createMemo, createSignal } from "solid-js";
import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import {
  isStatClockIngredient,
  type TF2CraftingRecipe,
  type TF2Item,
} from "./tf2-crafting-recipes.js";

export function createTF2Crafting(items: () => EconomyInventoryItemDto[]) {
  const [recipe, setRecipe] = createSignal<TF2CraftingRecipe>();
  const [statClock, setStatClock] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [confirmationOpen, setConfirmationOpen] = createSignal(false);
  const active = () => !!recipe() || statClock();
  const requiredCount = () => recipe()?.requiredCount ?? 5;
  const selectedItems = createMemo(() => {
    const wanted = new Set(selectedIds());
    return items().filter(
      (item): item is TF2Item =>
        item.game === "tf2" && wanted.has(item.assetId),
    );
  });
  const eligible = (item: EconomyInventoryItemDto): item is TF2Item => {
    if (item.game !== "tf2") return false;
    if (statClock()) return isStatClockIngredient(item);
    const selectedRecipe = recipe();
    if (!selectedRecipe?.matches(item)) return false;
    const first = selectedItems()[0];
    return (
      !first ||
      !selectedRecipe.compatibility ||
      selectedRecipe.compatibility(first, item)
    );
  };
  const filterItems = (source: EconomyInventoryItemDto[]) =>
    active() ? source.filter(eligible) : source;
  const toggle = (item: EconomyInventoryItemDto) => {
    if (!eligible(item)) return;
    setSelectedIds((current) =>
      current.includes(item.assetId)
        ? current.filter((id) => id !== item.assetId)
        : current.length < requiredCount()
          ? [...current, item.assetId]
          : current,
    );
  };
  const reset = () => {
    setRecipe(undefined);
    setStatClock(false);
    setSelectedIds([]);
    setConfirmationOpen(false);
  };
  return {
    active,
    recipe,
    statClock,
    selectedIds,
    selectedItems,
    requiredCount,
    confirmationOpen,
    setConfirmationOpen,
    filterItems,
    toggle,
    startRecipe: (next: TF2CraftingRecipe) => {
      reset();
      setRecipe(next);
    },
    startStatClock: () => {
      reset();
      setStatClock(true);
    },
    reset,
  };
}
