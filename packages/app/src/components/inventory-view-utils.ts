import type { InventoryItemDto } from "@cs-inv-edit/contracts";

export function itemKindLabel(kind: InventoryItemDto["kind"] | undefined) {
  switch (kind) {
    case "weapon_skin":
      return "Weapon skin";
    case "sticker_item":
      return "Sticker";
    case "tool_item":
      return "Tool";
    case "container":
      return "Container";
    case "storage_unit":
      return "Storage unit";
    case "cs2_econ_item":
      return "CS2 item";
    case "unknown":
      return "Unknown item";
    default:
      return "Item";
  }
}

export function itemDisplayName(item: InventoryItemDto) {
  return item.customName || item.marketName || item.name || `CS2 item #${item.defindex}`;
}

export function itemSubtitle(item: InventoryItemDto) {
  const title = itemDisplayName(item);
  const candidates = [
    item.customName ? item.marketName : undefined,
    item.collection,
    item.exterior,
    item.rarity,
    itemKindLabel(item.kind),
  ];
  return candidates.find((value) => value && value !== title) ?? "";
}

export function itemInitials(item: InventoryItemDto) {
  const words = itemDisplayName(item)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
  return initials || "#";
}

export function itemKey(item: InventoryItemDto, index: number) {
  return `${index}:${item.id}:${item.defindex ?? ""}:${item.marketName ?? item.name}`;
}
