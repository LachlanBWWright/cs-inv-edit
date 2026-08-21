import { errAsync } from "neverthrow";
import type { OperationBackend } from "./api.js";

const unavailable = () =>
  errAsync({ message: "Unexpected backend call in test" });

export function createOperationBackendStub(
  overrides: Partial<OperationBackend> = {},
): OperationBackend {
  return {
    applyNameTag: unavailable,
    removeNameTag: unavailable,
    deleteItem: unavailable,
    applyStatTrakSwap: unavailable,
    applyStrangePart: unavailable,
    useItem: unavailable,
    useMultipleItems: unavailable,
    applyToolToItem: unavailable,
    applyToolToBaseItem: unavailable,
    giftItem: unavailable,
    ...overrides,
  };
}
