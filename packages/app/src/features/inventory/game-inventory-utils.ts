import type {
  EconomyInventorySource,
  EconomyInventoryItemDto,
  GameInventorySnapshot,
} from "@cs-inv-edit/contracts";
import type { CompactMode, EconomyInventorySort } from "../../shared/ui-types.js";

export type { EconomyInventorySort } from "../../shared/ui-types.js";

const tf2QualityRanks: Record<number, number> = {
  0: 0,
  6: 1,
  3: 2,
  1: 3,
  11: 4,
  5: 5,
  13: 6,
  14: 7,
  15: 8,
  7: 9,
  9: 9,
  8: 10,
};

export function sortEconomyInventoryItems(
  items: EconomyInventoryItemDto[],
  sort: EconomyInventorySort,
  prices: ReadonlyMap<string, number>,
) {
  const result = [...items];
  result.sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (sort === "name") return byName;
    if (sort === "quantity-high")
      return right.quantity - left.quantity || byName;
    if (sort === "quality-high" || sort === "quality-low") {
      const comparison =
        (tf2QualityRanks[left.details.qualityId] ?? 0) -
        (tf2QualityRanks[right.details.qualityId] ?? 0);
      return (sort === "quality-low" ? comparison : -comparison) || byName;
    }
    const comparison =
      (prices.get(left.marketName ?? "") ?? 0) -
      (prices.get(right.marketName ?? "") ?? 0);
    return (sort === "price-low" ? comparison : -comparison) || byName;
  });
  return result;
}

export function snapshotForGame(
  game: EconomyInventorySource,
  snapshot?: GameInventorySnapshot,
) {
  return snapshot?.game === game ? snapshot : undefined;
}

export function gameFilterCategories(game: EconomyInventorySource) {
  if (game === "steam" || game === "steam-service")
    return new Set([
      "item_class",
      "game",
      "cardborder",
      "droprate",
      "event",
      "type",
      "rarity",
      "quality",
    ]);
  return game === "tf2"
    ? new Set(["quality", "slot", "class"])
    : new Set(["rarity", "quality", "hero", "slot", "type"]);
}

export function economyCategoryOptions(
  game: EconomyInventorySource,
  snapshot?: GameInventorySnapshot,
) {
  const allowed = gameFilterCategories(game);
  const options = new Map<string, string>();
  for (const item of snapshotForGame(game, snapshot)?.items ?? []) {
    for (const tag of item.tags) {
      const category = tag.category.toLowerCase();
      if (allowed.has(category))
        options.set(
          `${category}\u0000${tag.internalName}`,
          `${tag.category}: ${tag.name}`,
        );
    }
  }
  return [...options].sort((left, right) => left[1].localeCompare(right[1]));
}

const tf2QualityClasses: Record<string, string> = {
  normal: "economy-outline--tf2-normal",
  unique: "economy-outline--tf2-unique",
  vintage: "economy-outline--tf2-vintage",
  genuine: "economy-outline--tf2-genuine",
  strange: "economy-outline--tf2-strange",
  unusual: "economy-outline--tf2-unusual",
  haunted: "economy-outline--tf2-haunted",
  collectors: "economy-outline--tf2-collectors",
  community: "economy-outline--tf2-community",
  selfmade: "economy-outline--tf2-selfmade",
  "self-made": "economy-outline--tf2-selfmade",
  developer: "economy-outline--tf2-valve",
  valve: "economy-outline--tf2-valve",
  paintkitweapon: "economy-outline--tf2-decorated",
  decorated: "economy-outline--tf2-decorated",
  "collector's": "economy-outline--tf2-collectors",
  collector: "economy-outline--tf2-collectors",
};

const tf2QualityIdClasses: Record<number, string> = {
  0: "economy-outline--tf2-normal",
  1: "economy-outline--tf2-genuine",
  3: "economy-outline--tf2-vintage",
  5: "economy-outline--tf2-unusual",
  6: "economy-outline--tf2-unique",
  7: "economy-outline--tf2-community",
  8: "economy-outline--tf2-valve",
  9: "economy-outline--tf2-selfmade",
  11: "economy-outline--tf2-strange",
  12: "economy-outline--tf2-unusual",
  13: "economy-outline--tf2-haunted",
  14: "economy-outline--tf2-collectors",
  15: "economy-outline--tf2-decorated",
};
const dotaRarityClasses: Record<string, string> = {
  common: "economy-outline--dota-common",
  uncommon: "economy-outline--dota-uncommon",
  rare: "economy-outline--dota-rare",
  mythical: "economy-outline--dota-mythical",
  legendary: "economy-outline--dota-legendary",
  immortal: "economy-outline--dota-immortal",
  arcana: "economy-outline--dota-arcana",
  ancient: "economy-outline--dota-ancient",
};

export function economyOutlineClass(item: EconomyInventoryItemDto) {
  if (item.game === "steam" || item.game === "steam-service") return "";
  const category = item.game === "tf2" ? "quality" : "rarity";
  const tagged = item.tags.find(
    (tag) => tag.category.toLowerCase() === category,
  )?.internalName;
  const internalName = (
    tagged ??
    (item.details.game === "tf2" ? item.details.schemaQuality : "") ??
    ""
  )
    .toLowerCase()
    .replace(/^rarity_/, "");
  return item.game === "tf2"
    ? (tf2QualityClasses[internalName] ??
        tf2QualityIdClasses[item.details.qualityId] ??
        "")
    : (dotaRarityClasses[internalName] ?? "");
}

export type TF2ItemEffect = "strange" | "unusual";

export function tf2ItemEffects(item: EconomyInventoryItemDto): TF2ItemEffect[] {
  if (item.game !== "tf2") return [];
  const searchable = [
    item.name,
    item.marketName,
    item.quality,
    item.details.schemaQuality,
    ...(item.descriptions ?? []),
    ...item.tags.flatMap((tag) => [tag.internalName, tag.name]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  const decodedNames =
    item.details.decodedAttributes?.map((entry) =>
      `${entry.name} ${entry.attributeClass ?? ""}`.toLowerCase(),
    ) ?? [];
  const effects: TF2ItemEffect[] = [];
  if (
    item.details.qualityId === 11 ||
    searchable.includes("strange") ||
    decodedNames.some((name) => name.includes("kill eater"))
  )
    effects.push("strange");
  if (
    item.details.qualityId === 5 ||
    searchable.includes("unusual") ||
    decodedNames.some((name) => name.includes("particle effect"))
  )
    effects.push("unusual");
  return effects;
}

export function calculateVirtualInventoryWindow(
  itemCount: number,
  width: number,
  height: number,
  scrollTop: number,
  compactMode: CompactMode,
) {
  const minimumWidth = compactMode === "icons" ? 105 : 165;
  const rowHeight = compactMode === "icons" ? 116 : 158;
  const columns = Math.max(1, Math.floor((width + 12) / (minimumWidth + 12)));
  const totalRows = Math.ceil(itemCount / columns);
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
  const visibleRows = Math.ceil(height / rowHeight) + 6;
  const lastRow = Math.min(totalRows, firstRow + visibleRows);
  return {
    columns,
    rowHeight,
    totalRows,
    firstRow,
    firstItem: firstRow * columns,
    lastItem: Math.min(itemCount, lastRow * columns),
  };
}

export function virtualInventoryWindowChanged(
  itemCount: number,
  width: number,
  height: number,
  previousScrollTop: number,
  nextScrollTop: number,
  compactMode: CompactMode,
) {
  const previous = calculateVirtualInventoryWindow(
    itemCount,
    width,
    height,
    previousScrollTop,
    compactMode,
  );
  const next = calculateVirtualInventoryWindow(
    itemCount,
    width,
    height,
    nextScrollTop,
    compactMode,
  );
  return (
    previous.firstItem !== next.firstItem || previous.lastItem !== next.lastItem
  );
}
