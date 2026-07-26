/**
 * Every failure that reaches the client goes through AppError, so the response
 * envelope has exactly one shape and a stack trace never leaks.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
    // 5xx messages are replaced before they reach the client. 4xx messages are
    // written for the user and are safe to show.
    this.expose = status < 500;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, "BAD_REQUEST", message, details);

export const notFound = (message = "Not found"): AppError =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, "CONFLICT", message, details);

export const payloadTooLarge = (message: string): AppError =>
  new AppError(413, "PAYLOAD_TOO_LARGE", message);

export const internal = (message = "Internal server error"): AppError =>
  new AppError(500, "INTERNAL", message);
