import type { Request, Response, NextFunction } from "express";
import { db } from "@/db/client";
import { requestMetrics } from "@/db/schema";
import { childLogger } from "@/lib/logger";

const log = childLogger("metrics");

/**
 * One row per request, written after the response has been sent.
 *
 * On `finish` rather than around the handler, so the timer covers the whole
 * response including streaming, and so that writing the row can never delay
 * the user. A telemetry insert that sits in front of a reply would turn the
 * performance panel into a cause of bad performance.
 */

/**
 * The Express route pattern, not the resolved path.
 *
 * `/api/notebooks/:id/chats/:chatId/messages` groups; the resolved path with
 * real ids does not, and a table keyed by resolved paths has one row group per
 * notebook, which is useless for finding a slow endpoint.
 *
 * `req.route` only exists once a handler has matched, which is why this runs at
 * finish time and falls back to the mount path for 404s.
 */
function routePattern(req: Request): string {
  const base = req.baseUrl || "";
  const path = (req.route as { path?: string } | undefined)?.path;
  if (path) return `${base}${path === "/" ? "" : path}` || "/";
  // No handler matched. Recording the raw url here would let anyone create
  // unbounded route cardinality by requesting random paths.
  return `${base || "/"} (unmatched)`;
}

/** Requests that would otherwise dominate the table without saying anything. */
const IGNORED = new Set(["/api/health", "/api/health (unmatched)"]);

export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = performance.now();

  res.on("finish", () => {
    const route = routePattern(req);
    if (IGNORED.has(route)) return;

    const durationMs = Math.round(performance.now() - started);
    // Read at finish time, not at entry: this middleware runs before the
    // session resolves, so `req.user` is only populated by the time the
    // response is done. Null for anonymous and unauthenticated requests, which
    // is itself worth seeing in the panel.
    const userId = req.user?.id ?? null;

    db.insert(requestMetrics)
      .values({ userId, method: req.method, route, status: res.statusCode, durationMs })
      .catch((error: unknown) => {
        // Diagnostic only. A failed metrics write must never surface to a user
        // whose request already succeeded.
        log.warn({ err: error, route }, "could not record request metrics");
      });
  });

  next();
}
