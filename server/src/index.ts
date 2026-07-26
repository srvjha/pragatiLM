import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { closeDb } from "@/db/client";
import { closeRedis } from "@/lib/clients/redis";
import { closeEvents } from "@/lib/events";
import { closeChatStream } from "@/lib/chat-stream";
import { closeQueues } from "@/queues";
import { ensureCollection } from "@/vector/qdrant.repository";

// Idempotent, and run by both processes, so whichever starts first creates the
// collection and the other confirms it.
await ensureCollection().catch((error: unknown) => {
  logger.error({ err: error }, "could not bootstrap the qdrant collection");
  process.exit(1);
});

const app = createApp();
const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT, webOrigin: env.WEB_ORIGIN }, "api listening");
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "api shutting down");

  const forceExit = setTimeout(() => {
    logger.error("forced exit, connections did not close in time");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([
    closeQueues(),
    closeEvents(),
    closeChatStream(),
    closeDb(),
    closeRedis(),
  ]);

  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));
