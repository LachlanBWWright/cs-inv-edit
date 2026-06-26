import { defaultFeatureSettings, type FeatureSettings } from "./backend";

export function isFeatureEnabled(settings: FeatureSettings, key: keyof FeatureSettings): boolean {
  switch (key) {
    case "enableStorageMutations":
      return settings.enableStorageMutations;
    case "enableTradeups":
      return settings.enableTradeups;
    case "enableStickerExtract":
      return settings.enableStickerExtract;
    case "enableStickerRemove":
      return settings.enableStickerRemove;
    case "enableStickerApply":
      return settings.enableStickerApply;
    default:
      return Boolean(settings[key]);
  }
}

export function describeFlag(key: keyof FeatureSettings, settings: FeatureSettings): string {
  const value = isFeatureEnabled(settings, key);
  switch (key) {
    case "enableStorageMutations":
      return value ? "Storage mutations are enabled for mock backend validation" : "Storage mutations are disabled";
    case "enableTradeups":
      return value ? "Trade-ups are enabled for validation harnesses" : "Trade-ups remain disabled by default";
    case "enableStickerExtract":
      return value ? "Sticker extraction is enabled" : "Sticker extraction is disabled until validation is complete";
    case "enableStickerRemove":
      return value ? "Sticker removal is enabled" : "Sticker removal is disabled by default";
    case "enableStickerApply":
      return value ? "Sticker apply is enabled" : "Sticker apply is disabled and marked low-confidence";
    default:
      return value ? "Enabled" : "Disabled";
  }
}

export const featureFlagOrder: Array<keyof FeatureSettings> = [
  "enableStorageMutations",
  "enableTradeups",
  "enableStickerExtract",
  "enableStickerRemove",
  "enableStickerApply",
  "validationMode",
  "sacrificialAccountMode",
];

export { defaultFeatureSettings, type FeatureSettings } from "./backend";
