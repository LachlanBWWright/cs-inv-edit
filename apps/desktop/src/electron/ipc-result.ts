import type { AppError } from "@cs-inv-edit/app";
import type { ResultAsync } from "neverthrow";

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export function serializeResult<T>(
  result: ResultAsync<T, AppError>,
): Promise<IpcResult<T>> {
  return result.match(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}
