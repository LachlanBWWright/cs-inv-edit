import { ResultAsync } from "neverthrow";
import { createAppError, type AppError } from "./result-http.js";

export function fromAppPromise<T>(
  promise: PromiseLike<T>,
  message = "Operation failed",
): ResultAsync<T, AppError> {
  return ResultAsync.fromPromise(Promise.resolve(promise), (cause) =>
    createAppError(message, undefined, cause),
  );
}

export function appErrorMessage(
  error: AppError,
  fallback = "Operation failed",
): string {
  if (error.cause instanceof Error && error.cause.message)
    return error.cause.message;
  return error.message || fallback;
}
