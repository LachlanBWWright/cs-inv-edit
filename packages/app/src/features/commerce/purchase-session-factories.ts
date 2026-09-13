import type {
  InitializeStorePurchaseRequest,
  PurchaseSession,
} from "@cs-inv-edit/contracts";

export function failedPurchaseSession(
  input: Pick<InitializeStorePurchaseRequest, "offerId" | "quantity"> & {
    name: string;
    amountMinor: number;
    message: string;
  },
): PurchaseSession {
  return {
    id: "failed",
    status: "failed",
    offerId: input.offerId,
    defIndex: 0,
    name: input.name,
    quantity: input.quantity,
    currency: "",
    amountMinor: input.amountMinor,
    formattedAmount: "",
    createdAt: new Date().toISOString(),
    message: input.message,
  };
}
