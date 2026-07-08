import { err, ResultAsync } from "neverthrow";

export interface AppError {
  message: string;
  status?: number;
  cause?: unknown;
}

export function createAppError(message: string, status?: number, cause?: unknown): AppError {
  return { message, status, cause };
}

export function requestJsonResult<T>(baseUrl: string, path: string, init?: RequestInit): ResultAsync<T, AppError> {
  const target = `${baseUrl}${path}`;

  return ResultAsync.fromPromise(fetch(target, init), (error) => createAppError(`Request failed for ${target}`, undefined, error)).andThen((response) => {
    if (!response.ok) {
      return err(createAppError(`${response.status} ${response.statusText}`, response.status));
    }

    return ResultAsync.fromPromise(response.json() as Promise<T>, (error) => createAppError(`Failed to parse JSON for ${target}`, response.status, error));
  });
}

export function postJsonResult<T>(baseUrl: string, path: string, input?: unknown): ResultAsync<T, AppError> {
  return requestJsonResult<T>(baseUrl, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
}
