import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";

export function rarityRank(rarity: string | undefined) {
  const value = rarity?.trim().toLowerCase() ?? "";
  if (["immortal", "contraband", "contraband (discontinued)", "clandestine"].includes(value)) return 8;
  if (["exceedingly rare", "rare special (★)", "rare special item", "knife", "gloves", "unusual"].includes(value)) return 7;
  if (["ancient", "covert", "extraordinary", "master"].includes(value)) return 6;
  if (["legendary", "classified", "exotic", "superior"].includes(value)) return 5;
  if (["mythical", "restricted", "remarkable", "exceptional"].includes(value)) return 4;
  if (["rare", "mil-spec", "mil-spec grade", "high grade", "distinguished"].includes(value)) return 3;
  if (["uncommon", "industrial grade", "medium grade"].includes(value)) return 2;
  if (["common", "consumer grade", "base grade"].includes(value)) return 1;
  return 0;
}

export function sortRelatedItemsByRarity(items: RelatedItemDto[]) {
  return [...items].sort((left, right) => rarityRank(right.rarity) - rarityRank(left.rarity) || (left.marketName || left.name).localeCompare(right.marketName || right.name));
}

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

export function isOpenableContainer(item: InventoryItemDto | undefined) {
  if (!item) return false;
  if (item.kind === "container" || (item.containerItems?.length ?? 0) > 0) return true;
  return /(?:container|capsule|case|graffiti box)/i.test(`${item.name} ${item.marketName ?? ""}`);
}

export function itemWeaponName(item: InventoryItemDto) {
  if (item.kind !== "weapon_skin") return undefined;
  const displayName = item.marketName || item.name;
  const weapon = displayName.split("|")[0]?.replace(/^(?:★\s*)?(?:StatTrak™\s+|Souvenir\s+)*/i, "").trim();
  return weapon || undefined;
}

function splitInventoryName(item: InventoryItemDto) {
  const fullName = item.marketName || item.name;
  const [typePart, ...nameParts] = fullName.split("|");
  const rawName = (nameParts.length > 0 ? nameParts.join("|") : typePart).trim();
  const qualifierMatch = rawName.match(/\s+\(([^)]+)\)$/);
  return {
    name: (qualifierMatch ? rawName.slice(0, qualifierMatch.index).trim() : rawName) || fullName,
    qualifier: qualifierMatch?.[1],
    type: nameParts.length > 0 ? typePart?.replace(/^(?:★\s*)?(?:StatTrak™\s+|Souvenir\s+)*/i, "").trim() : undefined,
  };
}

export function compactItemName(item: InventoryItemDto) {
  return item.customName || splitInventoryName(item).name;
}

export function compactItemMeta(item: InventoryItemDto) {
  const parts = splitInventoryName(item);
  const type = item.kind === "weapon_skin" ? itemWeaponName(item) : parts.type || itemKindLabel(item.kind);
  const qualifier = item.exterior || parts.qualifier;
  return [type, qualifier].filter((value, index, values): value is string => !!value && values.indexOf(value) === index).join(" · ");
}

export type InventorySort = "name" | "float-low" | "float-high" | "rarity-low" | "rarity-high";

export function sortInventoryItems(items: InventoryItemDto[], sort: InventorySort) {
  return [...items].sort((left, right) => {
    if (sort === "float-low" || sort === "float-high") {
      if (left.paintWear === undefined) return right.paintWear === undefined ? 0 : 1;
      if (right.paintWear === undefined) return -1;
      const comparison = left.paintWear - right.paintWear;
      return sort === "float-low" ? comparison : -comparison;
    }
    if (sort === "rarity-low" || sort === "rarity-high") {
      const comparison = rarityRank(left.rarity) - rarityRank(right.rarity);
      return (sort === "rarity-low" ? comparison : -comparison) || itemDisplayName(left).localeCompare(itemDisplayName(right));
    }
    return itemDisplayName(left).localeCompare(itemDisplayName(right));
  });
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
