import type { EconomyGame, EconomyInventoryItemDto, GameInventorySnapshot } from "@cs-inv-edit/contracts";

export function snapshotForGame(game: EconomyGame, snapshot?: GameInventorySnapshot) {
  return snapshot?.game === game ? snapshot : undefined;
}

export function gameFilterCategories(game: EconomyGame) {
  return game === "tf2" ? new Set(["quality", "slot", "class"]) : new Set(["rarity", "quality", "hero", "slot", "type"]);
}

const tf2QualityClasses: Record<string, string> = { normal: "economy-outline--tf2-normal", unique: "economy-outline--tf2-unique", vintage: "economy-outline--tf2-vintage", genuine: "economy-outline--tf2-genuine", strange: "economy-outline--tf2-strange", unusual: "economy-outline--tf2-unusual", haunted: "economy-outline--tf2-haunted", collectors: "economy-outline--tf2-collectors", community: "economy-outline--tf2-community", selfmade: "economy-outline--tf2-selfmade" };
const dotaRarityClasses: Record<string, string> = { common: "economy-outline--dota-common", uncommon: "economy-outline--dota-uncommon", rare: "economy-outline--dota-rare", mythical: "economy-outline--dota-mythical", legendary: "economy-outline--dota-legendary", immortal: "economy-outline--dota-immortal", arcana: "economy-outline--dota-arcana", ancient: "economy-outline--dota-ancient" };

export function economyOutlineClass(item: EconomyInventoryItemDto) {
  const category = item.game === "tf2" ? "quality" : "rarity";
	const tagged = item.tags.find((tag) => tag.category.toLowerCase() === category)?.internalName;
	const internalName = (tagged ?? (item.details.game === "tf2" ? item.details.schemaQuality : "") ?? "").toLowerCase().replace(/^rarity_/, "");
  return item.game === "tf2" ? tf2QualityClasses[internalName] ?? "" : dotaRarityClasses[internalName] ?? "";
}

export function calculateVirtualInventoryWindow(itemCount: number, width: number, height: number, scrollTop: number, compactMode: "icons" | "concise" | "detailed") {
  const minimumWidth = compactMode === "icons" ? 105 : 165;
  const rowHeight = compactMode === "icons" ? 116 : 158;
  const columns = Math.max(1, Math.floor((width + 12) / (minimumWidth + 12)));
  const totalRows = Math.ceil(itemCount / columns);
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
  const visibleRows = Math.ceil(height / rowHeight) + 6;
  const lastRow = Math.min(totalRows, firstRow + visibleRows);
  return { columns, rowHeight, totalRows, firstRow, firstItem: firstRow * columns, lastItem: Math.min(itemCount, lastRow * columns) };
}
