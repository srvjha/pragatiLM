import type { ApiErrorBody, ApiResponse, HealthReport } from "@/types/api";

/**
 * The only place that knows the API base URL or the response envelope shape.
 * Components and hooks call through it rather than reaching for fetch.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set. Copy client/.env.example to client/.env.local.",
  );
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...init,
      // The session lives in a cookie set by the API on its own origin, so
      // every call has to opt in to sending it. Without this the whole app is
      // signed out from the server's point of view.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    // A refused connection is the common case in development, when the server
    // is not running yet. It deserves a better message than "Failed to fetch".
    throw new ApiError(0, {
      code: "NETWORK",
      message: `Could not reach the API at ${API_URL}. Is the server running?`,
    });
  }

  // 204 has no body to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(response.status, {
      code: "INVALID_RESPONSE",
      message: `The API returned a non JSON response (HTTP ${response.status}).`,
    });
  }

  if ("error" in body) {
    throw new ApiError(response.status, body.error);
  }

  // A degraded health report is a 503 carrying a valid { data } envelope, so the
  // status is checked after the envelope rather than before it.
  if (!response.ok) {
    throw new ApiError(response.status, {
      code: "HTTP_ERROR",
      message: `The API returned HTTP ${response.status}.`,
      details: body.data,
    });
  }

  return body.data;
}

export function getHealth(): Promise<HealthReport> {
  return apiFetch<HealthReport>("/health", { cache: "no-store" });
}
