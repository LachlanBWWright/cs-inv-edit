import { err, fromThrowable, ok, type Result } from "neverthrow";
import type { SafeParseSchema } from "./result-http.js";

export interface StorageError {
  message: string;
  cause?: unknown;
}

const readItem = fromThrowable(
  (key: string) => globalThis.localStorage.getItem(key),
  (cause): StorageError => ({ message: "Unable to read local storage", cause }),
);

const parseJson = fromThrowable(
  (serialized: string): unknown => JSON.parse(serialized),
  (cause): StorageError => ({ message: "Stored JSON is invalid", cause }),
);

const serializeJson = fromThrowable(
  (value: unknown) => JSON.stringify(value),
  (cause): StorageError => ({
    message: "Unable to serialize stored value",
    cause,
  }),
);

const writeItem = fromThrowable(
  ({ key, value }: { key: string; value: string }) => {
    globalThis.localStorage.setItem(key, value);
  },
  (cause): StorageError => ({
    message: "Unable to write local storage",
    cause,
  }),
);

export const stringArraySchema: SafeParseSchema<string[]> = {
  safeParse(value) {
    return Array.isArray(value) &&
      value.every((entry) => typeof entry === "string")
      ? { success: true, data: value }
      : { success: false, error: "Expected an array of strings" };
  },
};

export function readStoredJson<T>(
  key: string,
  schema: SafeParseSchema<T>,
): Result<T, StorageError> {
  return readItem(key).andThen((serialized) => {
    if (serialized === null)
      return err({ message: "Stored value does not exist" });
    return parseJson(serialized).andThen((value) => {
      const parsed = schema.safeParse(value);
      return parsed.success
        ? ok(parsed.data)
        : err({
            message: "Stored value has an invalid shape",
            cause: parsed.error,
          });
    });
  });
}

export function writeStoredJson(
  key: string,
  value: unknown,
): Result<void, StorageError> {
  return serializeJson(value).andThen((serialized) =>
    writeItem({ key, value: serialized }),
  );
}
