import type { NextFunction, Request, Response } from "express";
import type {} from "pino-http";
import { AppError } from "@/lib/errors";
import { isDevelopment } from "@/config/env";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appError =
    error instanceof AppError ? error : new AppError(500, "INTERNAL", "Internal server error");

  if (appError.status >= 500) {
    req.log.error({ err: error }, "request failed");
  } else {
    req.log.warn({ code: appError.code, status: appError.status }, appError.message);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      // A 5xx message may describe internals, so only 4xx messages are shown.
      message: appError.expose ? appError.message : "Internal server error",
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      ...(isDevelopment && !appError.expose && error instanceof Error
        ? { debug: error.message }
        : {}),
    },
  });
}
