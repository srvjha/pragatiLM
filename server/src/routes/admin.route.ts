import type { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { allQueues } from "@/queues";

/**
 * Development only. It exposes job payloads and lets you retry or remove work,
 * which is useful on a laptop and unacceptable on anything reachable.
 */
export function createAdminRouter(): Router {
  const adapter = new ExpressAdapter();
  adapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: Object.values(allQueues).map((queue) => new BullMQAdapter(queue)),
    serverAdapter: adapter,
  });

  return adapter.getRouter() as Router;
}
