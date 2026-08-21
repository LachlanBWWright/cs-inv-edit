import type { PriceScanResult } from "@cs-inv-edit/contracts";

export interface ReturnEstimate {
  expectedValueMinor: number;
  costMinor?: number;
  roiPercent?: number;
  pricedOutcomes: number;
  totalOutcomes: number;
}

export function steamPriceMap(result: PriceScanResult | undefined) {
  return new Map(
    (result?.items ?? []).flatMap((item) => {
      const quote =
        item.quotes.find((candidate) => candidate.source === "steam") ??
        item.quotes[0];
      const amount = quote?.adjustedAmountMinor ?? quote?.amountMinor;
      return amount === undefined ? [] : [[item.marketName, amount] as const];
    }),
  );
}

export async function scanPriceMap(
  marketNames: readonly string[],
  scan: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>,
) {
  const unique = [...new Set(marketNames.filter(Boolean))];
  const batches = Array.from(
    { length: Math.ceil(unique.length / 100) },
    (_, index) => unique.slice(index * 100, (index + 1) * 100),
  );
  const results = await Promise.all(batches.map((batch) => scan(batch, 730)));
  const prices = new Map<string, number>();
  for (const result of results) {
    for (const [name, amount] of steamPriceMap(result))
      prices.set(name, amount);
  }
  return prices;
}

export function expectedReturn(
  outcomes: ReadonlyArray<{ marketName?: string; probability: number }>,
  prices: ReadonlyMap<string, number>,
  costMinor?: number,
): ReturnEstimate {
  let expectedValueMinor = 0;
  let pricedOutcomes = 0;
  for (const outcome of outcomes) {
    const price = outcome.marketName
      ? prices.get(outcome.marketName)
      : undefined;
    if (price === undefined) continue;
    expectedValueMinor += price * outcome.probability;
    pricedOutcomes++;
  }
  return {
    expectedValueMinor,
    costMinor,
    roiPercent:
      costMinor && costMinor > 0
        ? ((expectedValueMinor - costMinor) / costMinor) * 100
        : undefined,
    pricedOutcomes,
    totalOutcomes: outcomes.length,
  };
}

export function formatUSDMinor(value: number) {
  return `USD ${(value / 100).toFixed(2)}`;
}
