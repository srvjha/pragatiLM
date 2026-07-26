import rateLimit from "express-rate-limit";
import { isDevelopment } from "@/config/env";

/**
 * NFR-11. Chat and ingestion are the expensive routes: each one can start model
 * calls, so an accidental loop in a client would otherwise spend real money.
 * The limits are generous enough that ordinary use never notices.
 */
const shared = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  // Development would otherwise trip the limit while testing the very features
  // the limit protects.
  skip: () => isDevelopment,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "That is a lot of requests in a short time. Wait a moment and try again.",
    },
  },
};

export const chatLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 30 });
export const ingestLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 60 });

/** Generation is the most expensive of all, so it gets its own slower bucket. */
export const artifactLimiter = rateLimit({ ...shared, windowMs: 5 * 60_000, limit: 5 });
