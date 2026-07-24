interface SteamInventoryAsset {
  appId: number;
  contextId: string;
  assetId: string;
}

const decimalId = /^\d+$/;

export function steamInventoryAssetURL(steamId: string, asset: SteamInventoryAsset): string | undefined {
  if (!decimalId.test(steamId) || !Number.isSafeInteger(asset.appId) || asset.appId <= 0 || !decimalId.test(asset.contextId) || !decimalId.test(asset.assetId)) {
    return undefined;
  }
  return `https://steamcommunity.com/profiles/${steamId}/inventory/#${asset.appId}_${asset.contextId}_${asset.assetId}`;
}

export function steamHostedSaleURL(input: SteamInventoryAsset & { steamId?: string; marketable?: boolean; contained?: boolean }): string | undefined {
  if (!input.steamId || input.marketable !== true || input.contained === true) return undefined;
  return steamInventoryAssetURL(input.steamId, input);
}
