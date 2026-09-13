import type { OperationReceipt } from "@cs-inv-edit/contracts";

export const tradeUpConfirmationPhrase = "TRADE UP";

export function tradeUpInputCost(
  items: ReadonlyArray<{ marketName?: string }>,
  prices: ReadonlyMap<string, number>,
) {
  return items.reduce(
    (sum, item) => sum + (prices.get(item.marketName ?? "") ?? 0),
    0,
  );
}

export function mergeMarketPrices(
  current: ReadonlyMap<string, number>,
  scanned: ReadonlyMap<string, number>,
) {
  const prices = new Map(current);
  for (const [name, value] of scanned) prices.set(name, value);
  return prices;
}

export function tradeUpReceiptAccepted(receipt: OperationReceipt | undefined) {
  return (
    receipt?.state === "completed" ||
    receipt?.state === "awaiting_gc_confirmation"
  );
}
