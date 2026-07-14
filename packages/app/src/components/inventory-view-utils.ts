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

export function resolveSelectedInventoryItem(items: InventoryItemDto[], selectedItemId: string | undefined) {
  if (!items.length) return undefined;
  if (selectedItemId) {
    return items.find((item) => item.id === selectedItemId) ?? items[0];
  }
  return items[0];
}

export function rarityBorderClass(rarity: string | undefined) {
  const normalizedRarity = rarity?.trim().toLowerCase().replace(/\s+/g, " ");

  switch (normalizedRarity) {
    // Backend `common`: Common / Consumer Grade / Base Grade — white.
    case "common":
    case "consumer grade":
    case "base grade":
      return "rarity-outline rarity-common";
    // Backend `uncommon`: Uncommon / Industrial Grade — baby blue.
    case "uncommon":
    case "industrial grade":
      return "rarity-outline rarity-uncommon";
    // Backend `rare`: Rare / Mil-Spec / High Grade — navy blue.
    case "rare":
    case "mil-spec":
    case "mil-spec grade":
    case "high grade":
      return "rarity-outline rarity-rare";
    // Backend `mythical`: Mythical / Restricted / Remarkable — purple.
    case "mythical":
    case "restricted":
    case "remarkable":
      return "rarity-outline rarity-mythical";
    // Backend `legendary`: Legendary / Classified / Exotic — hot pink.
    case "legendary":
    case "classified":
    case "exotic":
      return "rarity-outline rarity-legendary";
    // Backend `ancient`: Ancient / Covert / Extraordinary — red.
    case "ancient":
    case "covert":
    case "extraordinary":
      return "rarity-outline rarity-ancient";
    // Rare Special items (including knives and gloves) — gold.
    case "rare special":
    case "rare special (★)":
    case "rare special grade":
    case "rare special item":
    case "knife":
    case "gloves":
      return "rarity-outline rarity-exceedingly-rare";
    // Backend `immortal`: Immortal / discontinued Contraband — rose gold.
    case "immortal":
    case "contraband":
    case "contraband (discontinued)":
      return "rarity-outline rarity-immortal";
    default:
      return "rarity-outline";
  }
}
