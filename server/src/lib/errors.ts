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

export const unauthorized = (message = "Sign in to continue."): AppError =>
  new AppError(401, "UNAUTHORIZED", message);

export const notFound = (message = "Not found"): AppError =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, "CONFLICT", message, details);

/**
 * Out of credits for this period.
 *
 * 402 rather than 429: this is not "too fast", it is "the allowance is spent",
 * and waiting will not help before the period resets. The client renders it as an
 * upgrade prompt, so `details` carries the numbers it needs to say something
 * specific instead of "something went wrong".
 */
export const insufficientCredits = (message: string, details?: unknown): AppError =>
  new AppError(402, "INSUFFICIENT_CREDITS", message, details);

/**
 * The action is not on this plan at any balance.
 *
 * Distinct from insufficientCredits because the remedy is different: no amount of
 * waiting or spending less unlocks it. Only changing plan does.
 */
export const planRequired = (message: string, details?: unknown): AppError =>
  new AppError(403, "PLAN_REQUIRED", message, details);

export const payloadTooLarge = (message: string): AppError =>
  new AppError(413, "PAYLOAD_TOO_LARGE", message);

export const internal = (message = "Internal server error"): AppError =>
  new AppError(500, "INTERNAL", message);
