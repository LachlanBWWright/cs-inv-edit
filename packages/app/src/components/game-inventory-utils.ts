import type {
  EconomyInventorySource,
  EconomyInventoryItemDto,
  GameInventorySnapshot,
} from "@cs-inv-edit/contracts";

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
    ? (tf2QualityClasses[internalName] ?? "")
    : (dotaRarityClasses[internalName] ?? "");
}

export function calculateVirtualInventoryWindow(
  itemCount: number,
  width: number,
  height: number,
  scrollTop: number,
  compactMode: "icons" | "concise" | "detailed",
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
  compactMode: "icons" | "concise" | "detailed",
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
