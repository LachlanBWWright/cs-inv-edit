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
    // Backend `common`: Consumer Grade / Base Grade — white (#B0C3D9).
    case "common":
    case "consumer grade":
    case "base grade":
      return "rarity-outline rarity-common";
    // Backend `uncommon`: Industrial Grade / Medium Grade — baby blue (#5E98D9).
    case "uncommon":
    case "industrial grade":
    case "medium grade":
      return "rarity-outline rarity-uncommon";
    // Backend `rare`: Mil-Spec / High Grade / Distinguished agents — blue (#4B69FF).
    case "rare":
    case "mil-spec":
    case "mil-spec grade":
    case "high grade":
    case "distinguished":
      return "rarity-outline rarity-rare";
    // Backend `mythical`: Restricted / Remarkable / Exceptional agents — purple (#8847FF).
    case "mythical":
    case "restricted":
    case "remarkable":
    case "exceptional":
      return "rarity-outline rarity-mythical";
    // Backend `legendary`: Classified / Exotic / Superior agents — hot pink (#D32CE6).
    case "legendary":
    case "classified":
    case "exotic":
    case "superior":
      return "rarity-outline rarity-legendary";
    // Backend `ancient`: Covert / Extraordinary / Master agents — red (#EB4B4B).
    case "ancient":
    case "covert":
    case "extraordinary":
    case "master":
      return "rarity-outline rarity-ancient";
    // Backend `unusual` and Rare Special items (knives/gloves) — gold (#E4AE39).
    case "unusual":
    case "rare special":
    case "rare special (★)":
    case "rare special grade":
    case "rare special item":
    case "knife":
    case "gloves":
      return "rarity-outline rarity-exceedingly-rare";
    // Backend `immortal`: Contraband (plus legacy Clandestine/Exceptional) — gold-orange (#E4AE33).
    case "immortal":
    case "contraband":
    case "contraband (discontinued)":
    case "clandestine":
      return "rarity-outline rarity-immortal";
    // Backend `default` and stock items use the neutral outline.
    case "default":
    case "stock":
    case "standard":
    default:
      return "rarity-outline";
  }
}
