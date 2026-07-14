import type { InventoryItemDto } from "@cs-inv-edit/contracts";

export function formatFloat(value: number) {
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export function hasSkinWearFloat(item: Pick<InventoryItemDto, "kind" | "paintWear">) {
  return item.kind === "weapon_skin" && item.paintWear !== undefined;
}
