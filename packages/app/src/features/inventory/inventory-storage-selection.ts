import type { InventoryItemDto } from "@cs-inv-edit/contracts";

export const storageCapacity = 1_000;

export function storageSelectionLimit(unit: InventoryItemDto) {
  return Math.max(0, storageCapacity - (unit.storageCount ?? 0));
}

export function storageMoveCandidates(
  items: InventoryItemDto[],
  unit: InventoryItemDto,
) {
  return items.filter(
    (item) => item.id !== unit.id && item.storageEligible === true,
  );
}
