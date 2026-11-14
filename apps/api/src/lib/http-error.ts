import type { ApiErrorBody } from "@repo/shared";

export type ErrorCode =
  | "validation_error"
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "upstream_auth_error"
  | "upstream_timeout"
  | "upstream_unreachable"
  | "upstream_invalid_response"
  | "upstream_error"
  | "internal_error"
  | "unauthorized";

/** An error that maps to a JSON response: `{ error: { code, message } }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(status: number, code: ErrorCode, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}

/** Turns anything thrown by a handler into our standard error response. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return errorResponse(err.status, err.code, err.message);
  }
  console.error(err);
  return errorResponse(500, "internal_error", "Internal server error");
}
