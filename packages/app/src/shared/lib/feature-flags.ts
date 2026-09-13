import type { SettingsData } from "@cs-inv-edit/contracts";

export function priceFeaturesEnabled(settings?: SettingsData) {
  return priceFeaturesEnabledFromFlags(settings?.featureFlags);
}

export function priceFeaturesEnabledFromFlags(
  flags?: Pick<SettingsData["featureFlags"], "enablePriceAnalysis">,
) {
  return flags?.enablePriceAnalysis === true;
}
