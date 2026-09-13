import type { OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState } from "./format.js";
import { appErrorMessage, fromAppPromise } from "./result.js";

export async function runOperationAction(input: {
  execute: () => Promise<OperationReceipt>;
  setPending: (pending: boolean) => void;
  setStatus: (status: string) => void;
  errorMessage: string;
}) {
  input.setPending(true);
  await fromAppPromise(input.execute(), input.errorMessage).match(
    (receipt) =>
      input.setStatus(`${receipt.type}: ${formatState(receipt.state)}`),
    (error) => input.setStatus(appErrorMessage(error, "Request failed")),
  );
  input.setPending(false);
}
