import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { toNodeHandler } from "better-auth/node";
import { env, isDevelopment, socialProviders } from "@/config/env";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { healthRouter } from "@/routes/health.route";
import { notebookRouter } from "@/routes/notebook.route";
import { billingRouter, handleWebhook } from "@/routes/billing.route";
import { analyticsRouter } from "@/routes/analytics.route";
import { errorHandler, notFoundHandler } from "@/middleware/error";
import { createAdminRouter } from "@/routes/admin.route";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

  app.use(
    compression({
      // Compression buffers until it has enough bytes to be worth a frame, which
      // holds an event stream open and delivers nothing. Server sent responses
      // opt out entirely.
      filter: (req, res) => {
        if (res.getHeader("Content-Type") === "text/event-stream") return false;
        return compression.filter(req, res);
      },
    }),
  );

  app.use(
    pinoHttp({
      logger,
      // NFR-6: one id per request, propagated into job logs so a question can be
      // followed from the HTTP call through to the worker.
      genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const id = typeof existing === "string" ? existing : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
    }),
  );

  // Better Auth reads the raw request body itself, so its handler has to be
  // mounted before the JSON parser consumes the stream. Everything after this
  // line gets a parsed body; sign in and sign up do not need one.
  app.all("/api/auth/*splat", toNodeHandler(auth));

  // Which sign in methods actually work, so the web app can render buttons for
  // the providers that are configured instead of ones that fail on click.
  app.get("/api/auth-methods", (_req, res) => {
    res.json({ data: { emailAndPassword: true, ...socialProviders } });
  });

  // Razorpay signs the exact bytes it sent, so this needs the raw body and has
  // to be mounted ahead of the JSON parser. Re-serialising parsed JSON changes
  // key order and whitespace, and the HMAC would never match.
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    handleWebhook,
  );

  app.use(express.json({ limit: "1mb" }));

  if (isDevelopment) {
    // Bull Board serves its own assets, which the default helmet CSP blocks.
    app.use("/admin/queues", helmet({ contentSecurityPolicy: false }), createAdminRouter());
  }

  app.use("/api", healthRouter);
  app.use("/api", billingRouter);
  app.use("/api", analyticsRouter);
  app.use("/api", notebookRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
