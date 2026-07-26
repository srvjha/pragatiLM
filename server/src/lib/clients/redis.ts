import { Redis } from "ioredis";
import { env } from "@/config/env";

/**
 * maxRetriesPerRequest must be null on any connection BullMQ uses, so the same
 * option is set here to keep one connection shape across the process.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
