import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { redis } from "@/lib/clients/redis";
import { qdrant } from "@/lib/clients/qdrant";
import { workerLiveness, type WorkerLiveness } from "@/lib/worker-heartbeat";

export type ServiceHealth = { ok: boolean; latencyMs: number; error?: string };

export type HealthReport = {
  status: "ok" | "degraded";
  uptimeSec: number;
  services: Record<"postgres" | "redis" | "qdrant", ServiceHealth>;
  /**
   * Whether anything is consuming the queues. Reported separately from the
   * services because it is not an outage: the API is perfectly healthy with no
   * worker attached, it just cannot finish anything anyone asks it to.
   */
  worker: WorkerLiveness;
};

/**
 * A failed TCP connect surfaces as an AggregateError whose own message is empty,
 * which would report an unreachable database as a blank reason. Unwrap it, and
 * fall back to the error code or name so the field is never empty.
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    const inner = [...new Set(error.errors.map(describeError))].join(", ");
    if (inner) return inner;
  }

  if (error instanceof Error) {
    if (error.message) return error.message;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    return error.name;
  }

  return String(error);
}

async function probe(check: () => Promise<unknown>): Promise<ServiceHealth> {
  const startedAt = performance.now();
  try {
    await check();
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: describeError(error),
    };
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const [postgres, redisHealth, qdrantHealth, worker] = await Promise.all([
    probe(() => db.execute(sql`select 1`)),
    probe(async () => {
      if (redis.status === "wait" || redis.status === "end") await redis.connect();
      return redis.ping();
    }),
    probe(() => qdrant.getCollections()),
    workerLiveness(),
  ]);

  const services = { postgres, redis: redisHealth, qdrant: qdrantHealth };
  const allOk = Object.values(services).every((service) => service.ok);

  return {
    status: allOk ? "ok" : "degraded",
    uptimeSec: Math.round(process.uptime()),
    services,
    worker,
  };
}
