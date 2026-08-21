import { err, ok, Result, ResultAsync } from "neverthrow";
export interface SafeParseSchema<T> {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
}

export interface AppError {
  message: string;
  status?: number;
  cause?: unknown;
}

export function createAppError(
  message: string,
  status?: number,
  cause?: unknown,
): AppError {
  return { message, status, cause };
}

export function requestJsonResult<T>(
  baseUrl: string,
  path: string,
  schema: SafeParseSchema<T>,
  init?: RequestInit,
): ResultAsync<T, AppError> {
  const target = `${baseUrl}${path}`;

  return ResultAsync.fromPromise(fetch(target, init), (error) =>
    createAppError(`Request failed for ${target}`, undefined, error),
  ).andThen((response) => {
    if (!response.ok) {
      return ResultAsync.fromPromise(response.text(), () => "")
        .mapErr(() =>
          createAppError(
            `${response.status} ${response.statusText}`,
            response.status,
          ),
        )
        .andThen((body) =>
          err(
            createAppError(
              errorMessageFromResponse(response, body),
              response.status,
            ),
          ),
        );
    }

    return ResultAsync.fromPromise(
      response.json() as Promise<unknown>,
      (error) =>
        createAppError(
          `Failed to parse JSON for ${target}`,
          response.status,
          error,
        ),
    ).andThen((payload) => {
      const parsed = schema.safeParse(payload);
      return parsed.success
        ? ok(parsed.data)
        : err(
            createAppError(
              `Invalid response payload for ${target}`,
              response.status,
              parsed.error,
            ),
          );
    });
  });
}

function errorMessageFromResponse(response: Response, body: string): string {
  const fallback = `${response.status} ${response.statusText}`;
  const trimmed = body.trim();
  if (trimmed === "") {
    return fallback;
  }
  return Result.fromThrowable(
    (): unknown => JSON.parse(trimmed),
    () => undefined,
  )().match(
    (parsed) => {
      if (typeof parsed !== "object" || parsed === null)
        return `${fallback}: ${trimmed}`;
      const message =
        "error" in parsed && typeof parsed.error === "string"
          ? parsed.error
          : "message" in parsed && typeof parsed.message === "string"
            ? parsed.message
            : "";
      return message === ""
        ? `${fallback}: ${trimmed}`
        : `${fallback}: ${message}`;
    },
    () => `${fallback}: ${trimmed}`,
  );
}

export function postJsonResult<T>(
  baseUrl: string,
  path: string,
  schema: SafeParseSchema<T>,
  input?: unknown,
): ResultAsync<T, AppError> {
  return requestJsonResult<T>(baseUrl, path, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
}
