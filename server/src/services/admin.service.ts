import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  adminAudit,
  creditLedger,
  llmUsage,
  requestMetrics,
  subscriptions,
  users,
} from "@/db/schema";
import { planFor } from "@/billing/plans";
import { entitlementFor } from "@/services/billing/entitlements.service";
import { microsToRupees, PRICES_UPDATED } from "@/providers/llm/pricing";
import { childLogger } from "@/lib/logger";

const log = childLogger("admin:service");

const since = (days: number) => sql`now() - ${`${days} days`}::interval`;

/**
 * Everything the admin dashboard reads.
 *
 * Read only apart from `grantCredits`, which is the single write and is audited
 * before it happens. Every query is scoped by time rather than scanning the
 * whole table, because these run on the same Postgres serving users and a
 * dashboard refresh must not be the most expensive thing the database does.
 */

export type OverviewDto = {
  users: { total: number; newToday: number; newThisWeek: number; activeThisWeek: number };
  usage: {
    questions: number;
    sources: number;
    roadmaps: number;
    podcasts: number;
  };
  ai: {
    calls: number;
    totalTokens: number;
    costRupees: number;
    /** What the cost figures are based on, so nobody mistakes them for an invoice. */
    pricesUpdated: string;
  };
  api: { requests: number; errorRate: number; p50: number; p95: number; p99: number };
  revenue: { payingUsers: number; monthlyRupees: number };
};

/** Counts a user as active if they made any request in the window. */
async function activeSince(days: number): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(distinct ${requestMetrics.userId})::int` })
    .from(requestMetrics)
    .where(
      and(gte(requestMetrics.createdAt, since(days)), sql`${requestMetrics.userId} is not null`),
    );
  return row?.value ?? 0;
}

export async function getOverview(): Promise<OverviewDto> {
  const [totalUsers, newToday, newWeek, active, ledgerRollup, aiRollup, apiRollup, paying] =
    await Promise.all([
      db.select({ value: count() }).from(users),
      db
        .select({ value: count() })
        .from(users)
        .where(gte(users.createdAt, since(1))),
      db
        .select({ value: count() })
        .from(users)
        .where(gte(users.createdAt, since(7))),
      activeSince(7),

      // The credit ledger doubles as the usage log: every billable action already
      // writes a row naming what it was.
      db
        .select({ refType: creditLedger.refType, value: count() })
        .from(creditLedger)
        .where(and(eq(creditLedger.reason, "CONSUME"), gte(creditLedger.createdAt, since(30))))
        .groupBy(creditLedger.refType),

      db
        .select({
          calls: count(),
          tokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)::int`,
          micros: sql<number>`coalesce(sum(${llmUsage.costMicros}), 0)::bigint`,
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, since(30))),

      db
        .select({
          requests: count(),
          errors: sql<number>`count(*) filter (where ${requestMetrics.status} >= 500)::int`,
          p50: sql<number>`coalesce(percentile_disc(0.50) within group (order by ${requestMetrics.durationMs}), 0)::int`,
          p95: sql<number>`coalesce(percentile_disc(0.95) within group (order by ${requestMetrics.durationMs}), 0)::int`,
          p99: sql<number>`coalesce(percentile_disc(0.99) within group (order by ${requestMetrics.durationMs}), 0)::int`,
        })
        .from(requestMetrics)
        .where(gte(requestMetrics.createdAt, since(7))),

      db
        .select({ planCode: subscriptions.planCode, value: count() })
        .from(subscriptions)
        .where(eq(subscriptions.status, "ACTIVE"))
        .groupBy(subscriptions.planCode),
    ]);

  const byType = new Map(ledgerRollup.map((row) => [row.refType, Number(row.value)]));
  const api = apiRollup[0];
  const ai = aiRollup[0];

  const monthlyPaise = paying.reduce((total, row) => {
    const plan = planFor(row.planCode);
    return total + plan.pricePaise * Number(row.value);
  }, 0);

  return {
    users: {
      total: Number(totalUsers[0]?.value ?? 0),
      newToday: Number(newToday[0]?.value ?? 0),
      newThisWeek: Number(newWeek[0]?.value ?? 0),
      activeThisWeek: active,
    },
    usage: {
      questions: byType.get("chat") ?? 0,
      sources: byType.get("source") ?? 0,
      roadmaps: byType.get("roadmap") ?? 0,
      podcasts: byType.get("podcast") ?? 0,
    },
    ai: {
      calls: Number(ai?.calls ?? 0),
      totalTokens: Number(ai?.tokens ?? 0),
      costRupees: microsToRupees(Number(ai?.micros ?? 0)),
      pricesUpdated: PRICES_UPDATED,
    },
    api: {
      requests: Number(api?.requests ?? 0),
      // Only 5xx. A 402 on an exhausted allowance or a 404 on a deleted
      // notebook is the system working, and folding those in would make the
      // error rate meaningless as an alarm.
      errorRate: api?.requests ? Number(api.errors) / Number(api.requests) : 0,
      p50: Number(api?.p50 ?? 0),
      p95: Number(api?.p95 ?? 0),
      p99: Number(api?.p99 ?? 0),
    },
    revenue: {
      payingUsers: paying.reduce((total, row) => total + Number(row.value), 0),
      monthlyRupees: monthlyPaise / 100,
    },
  };
}

export type SignupPoint = { day: string; signups: number; active: number };

/** Signups and active users per day, for the growth chart. */
export async function getSignupSeries(days = 30): Promise<SignupPoint[]> {
  const rows = await db.execute<{ day: string; signups: number; active: number }>(sql`
    with span as (
      select generate_series(
        date_trunc('day', now() - ${`${days - 1} days`}::interval),
        date_trunc('day', now()),
        '1 day'
      )::date as day
    ),
    signups as (
      select date_trunc('day', ${users.createdAt})::date as day, count(*)::int as n
      from ${users} where ${users.createdAt} >= ${since(days)} group by 1
    ),
    actives as (
      select date_trunc('day', ${requestMetrics.createdAt})::date as day,
             count(distinct ${requestMetrics.userId})::int as n
      from ${requestMetrics}
      where ${requestMetrics.createdAt} >= ${since(days)} and ${requestMetrics.userId} is not null
      group by 1
    )
    select span.day::text as day,
           coalesce(signups.n, 0) as signups,
           coalesce(actives.n, 0) as active
    from span
    left join signups on signups.day = span.day
    left join actives on actives.day = span.day
    order by span.day
  `);
  return rows.rows.map((row) => ({
    day: row.day,
    signups: Number(row.signups),
    active: Number(row.active),
  }));
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  plan: string;
  /** Minutes between the first and last request of each session, summed. */
  minutesSpent: number;
  questions: number;
  sources: number;
  tokens: number;
  costRupees: number;
  lastSeen: string | null;
};

/**
 * The user table.
 *
 * `minutesSpent` is a proxy and should be read as one: it is the span between
 * the first and last request within a session, summed over sessions. It cannot
 * see someone reading an answer for ten minutes without clicking, and it counts
 * a tab left open as zero rather than as time. It is the honest cheap measure;
 * anything better needs client heartbeats, which is a bigger change than this
 * dashboard justified.
 */
export async function listUsers(limit = 100): Promise<AdminUserRow[]> {
  // A named row shape rather than Record<string, unknown>: the raw driver
  // returns unknown, and String(unknown) silently yields "[object Object]" for
  // anything that is not already a primitive.
  type Raw = {
    id: string;
    name: string | null;
    email: string;
    created_at: string;
    plan: string | null;
    minutes: string | number | null;
    questions: number;
    sources: number;
    tokens: number;
    micros: string | number;
    last_bucket: string | null;
  };

  const rows = await db.execute<Raw>(sql`
    with spans as (
      select ${requestMetrics.userId} as user_id,
             date_trunc('hour', ${requestMetrics.createdAt}) as bucket,
             extract(epoch from (max(${requestMetrics.createdAt}) - min(${requestMetrics.createdAt}))) as seconds
      from ${requestMetrics}
      where ${requestMetrics.userId} is not null
      group by 1, 2
    ),
    time_spent as (
      select user_id, sum(seconds) / 60.0 as minutes, max(bucket) as last_bucket from spans group by 1
    ),
    ai as (
      select ${llmUsage.userId} as user_id,
             sum(${llmUsage.totalTokens})::int as tokens,
             sum(${llmUsage.costMicros})::bigint as micros
      from ${llmUsage} where ${llmUsage.userId} is not null group by 1
    ),
    spend as (
      select ${creditLedger.userId} as user_id, ${creditLedger.refType} as ref_type, count(*)::int as n
      from ${creditLedger} where ${creditLedger.reason} = 'CONSUME' group by 1, 2
    )
    select u.id, u.name, u.email, u.created_at,
           coalesce(s.plan_code, 'free') as plan,
           coalesce(t.minutes, 0) as minutes,
           coalesce((select n from spend where spend.user_id = u.id and ref_type = 'chat'), 0) as questions,
           coalesce((select n from spend where spend.user_id = u.id and ref_type = 'source'), 0) as sources,
           coalesce(ai.tokens, 0) as tokens,
           coalesce(ai.micros, 0) as micros,
           t.last_bucket
    from ${users} u
    left join ${subscriptions} s on s.user_id = u.id and s.status = 'ACTIVE'
    left join time_spent t on t.user_id = u.id
    left join ai on ai.user_id = u.id
    order by u.created_at desc
    limit ${limit}
  `);

  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name ?? "",
    email: row.email,
    createdAt: new Date(row.created_at).toISOString(),
    plan: row.plan ?? "free",
    minutesSpent: Math.round(Number(row.minutes ?? 0)),
    questions: Number(row.questions ?? 0),
    sources: Number(row.sources ?? 0),
    tokens: Number(row.tokens ?? 0),
    costRupees: microsToRupees(Number(row.micros ?? 0)),
    lastSeen: row.last_bucket ? new Date(row.last_bucket).toISOString() : null,
  }));
}

export type FeatureUsage = { feature: string; calls: number; tokens: number; costRupees: number };

/** AI spend broken down by which part of the product caused it. */
export async function getAiByFeature(days = 30): Promise<FeatureUsage[]> {
  const rows = await db
    .select({
      feature: llmUsage.feature,
      calls: count(),
      tokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)::int`,
      micros: sql<number>`coalesce(sum(${llmUsage.costMicros}), 0)::bigint`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, since(days)))
    .groupBy(llmUsage.feature)
    .orderBy(desc(sql`sum(${llmUsage.costMicros})`));

  return rows.map((row) => ({
    feature: row.feature,
    calls: Number(row.calls),
    tokens: Number(row.tokens),
    costRupees: microsToRupees(Number(row.micros)),
  }));
}

export type RoutePerformance = {
  route: string;
  method: string;
  requests: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  maxMs: number;
};

/** Slowest routes first, because that is the question this panel answers. */
export async function getRoutePerformance(days = 7): Promise<RoutePerformance[]> {
  const rows = await db
    .select({
      route: requestMetrics.route,
      method: requestMetrics.method,
      requests: count(),
      errors: sql<number>`count(*) filter (where ${requestMetrics.status} >= 500)::int`,
      p50: sql<number>`percentile_disc(0.50) within group (order by ${requestMetrics.durationMs})::int`,
      p95: sql<number>`percentile_disc(0.95) within group (order by ${requestMetrics.durationMs})::int`,
      p99: sql<number>`percentile_disc(0.99) within group (order by ${requestMetrics.durationMs})::int`,
      maxMs: sql<number>`max(${requestMetrics.durationMs})::int`,
    })
    .from(requestMetrics)
    .where(gte(requestMetrics.createdAt, since(days)))
    .groupBy(requestMetrics.route, requestMetrics.method)
    .orderBy(desc(sql`percentile_disc(0.95) within group (order by ${requestMetrics.durationMs})`))
    .limit(40);

  return rows.map((row) => ({
    route: row.route,
    method: row.method,
    requests: Number(row.requests),
    errorRate: Number(row.requests) ? Number(row.errors) / Number(row.requests) : 0,
    p50: Number(row.p50 ?? 0),
    p95: Number(row.p95 ?? 0),
    p99: Number(row.p99 ?? 0),
    maxMs: Number(row.maxMs ?? 0),
  }));
}

export type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  subjectEmail: string | null;
  detail: string;
  createdAt: string;
};

export async function listAudit(limit = 50): Promise<AuditRow[]> {
  const rows = await db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt)).limit(limit);

  return rows.map((row) => ({
    id: row.id,
    actorEmail: row.actorEmail,
    action: row.action,
    subjectEmail: row.subjectEmail,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Hands an account credits, and records who did it before doing it.
 *
 * Writes an ADJUSTMENT row to the same append only ledger every other credit
 * movement uses, so a granted credit is indistinguishable from an earned one at
 * spend time and the balance is still a sum over one table.
 *
 * The audit row is written first. If the grant then fails the log has an entry
 * for something that did not happen, which is recoverable by reading the
 * ledger; the reverse, a grant with no record of who made it, is not.
 */
export async function grantCredits(input: {
  actor: { id: string; email: string };
  userId: string;
  credits: number;
  note: string;
}): Promise<{ balance: number }> {
  const [subject] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!subject) throw new Error(`No user ${input.userId}`);

  await db.insert(adminAudit).values({
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: "grant_credits",
    subjectId: subject.id,
    subjectEmail: subject.email,
    detail: `${input.credits > 0 ? "+" : ""}${input.credits} credits. ${input.note}`.trim(),
  });

  const entitlement = await entitlementFor(subject.id);

  await db.insert(creditLedger).values({
    userId: subject.id,
    periodStart: entitlement.periodStart,
    delta: input.credits,
    reason: "ADJUSTMENT",
    refType: "admin",
    // Unique per grant, so the ledger's idempotency index does not collapse two
    // deliberate grants of the same size into one.
    refId: crypto.randomUUID(),
    meta: { note: input.note, by: input.actor.email },
  });

  log.info(
    { by: input.actor.email, to: subject.email, credits: input.credits },
    "admin granted credits",
  );

  const after = await entitlementFor(subject.id);
  return { balance: after.balance };
}
