/** Shared values used by multiple app views and their controls. */
export type CompactMode = "icons" | "concise" | "detailed";

export type InventorySort =
  | "name"
  | "float-low"
  | "float-high"
  | "rarity-low"
  | "rarity-high"
  | "price-low"
  | "price-high";

export type EconomyInventorySort =
  | "name"
  | "quality-high"
  | "quality-low"
  | "price-high"
  | "price-low"
  | "quantity-high";

export type RelatedItemPreviewContext = "collection" | "container" | "trade-up";

export type StatusTone = "default" | "success" | "warning" | "danger";
export type AppPlatform = "desktop" | "web";
export type { EconomyGame } from "@cs-inv-edit/contracts";
export type LoadingState = "loading" | "error";
export type SettingsRevealKey = "container" | "tradeUp" | "armory" | "terminal";
export type FeedbackTone = Extract<StatusTone, "default" | "success" | "danger">;
export type TF2ActivityLoading = "history" | "context";
