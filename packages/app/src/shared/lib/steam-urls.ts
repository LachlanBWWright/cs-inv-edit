export function steamMarketUrl(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

export function steamMarketSearchUrl(marketName: string) {
  return `https://steamcommunity.com/market/search?appid=730&q=${encodeURIComponent(marketName)}`;
}
