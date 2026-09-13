import { pgTable, uuid, text, integer, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * What the models actually cost, measured rather than estimated.
 *
 * Every figure quoted about this product's unit economics until now came from
 * multiplying published prices by a guess at how many calls a question makes.
 * This table replaces the guess: one row per model call, with the token counts
 * the provider itself reported.
 *
 * Diagnostic, like retrieval_runs. A failed write is logged and swallowed, and
 * nothing in the product reads it to make a decision. Billing continues to run
 * off the credit ledger, which is deliberate: credits are a promise to the user
 * about what an action costs them, and that promise must not move because a
 * model happened to be more verbose today.
 *
 * `userId` is nullable and set null on delete. A deleted account's rows stay as
 * anonymous cost history, because the money was spent whether or not the
 * account still exists.
 */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    /** Which part of the product spent this: chat, translate, route, grade, podcast, roadmap. */
    feature: text("feature").notNull(),
    /** The chatModel role, so a cost can be traced to the model choice behind it. */
    role: text("role").notNull(),
    model: text("model").notNull(),

    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),

    /**
     * Cost in micro-rupees, not paise.
     *
     * A single nano-model call costs a small fraction of one paisa, and an
     * integer column in paise would round every one of them to zero, which
     * would make the totals wrong in the one direction that matters. Integers
     * rather than floats for the same reason money is an integer everywhere
     * else here.
     */
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),

    latencyMs: integer("latency_ms").notNull().default(0),
    /** Set when the call threw. Successful calls leave it null. */
    error: text("error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("llm_usage_user_time_idx").on(table.userId, table.createdAt),
    index("llm_usage_feature_time_idx").on(table.feature, table.createdAt),
    index("llm_usage_time_idx").on(table.createdAt),
  ],
);

/**
 * One row per HTTP request, for the performance panel.
 *
 * Raw rows rather than pre-aggregated buckets. At this traffic a day is a few
 * thousand rows, percentiles over raw data are honest, and pre-aggregation
 * throws away exactly the outliers worth looking at. The cleanup queue trims
 * the table; see ADMIN_METRICS_RETENTION_DAYS.
 *
 * `route` is the Express route pattern, never the resolved path, so a thousand
 * notebook ids collapse into one row group instead of a thousand.
 */
export const requestMetrics = pgTable(
  "request_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    method: text("method").notNull(),
    route: text("route").notNull(),
    status: integer("status").notNull(),
    durationMs: integer("duration_ms").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("request_metrics_time_idx").on(table.createdAt),
    index("request_metrics_route_time_idx").on(table.route, table.createdAt),
    index("request_metrics_user_time_idx").on(table.userId, table.createdAt),
  ],
);

/**
 * Every action an administrator takes, written before the action is applied.
 *
 * An admin panel that can grant credits is a panel that can be abused or
 * mistaken, and "who gave that account 5000 credits" has to be answerable
 * afterwards. Rows are never updated or deleted by the application.
 *
 * The actor is stored by id and by the email as it was at the time, because an
 * account can change its email and the log has to keep meaning what it meant.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),

    action: text("action").notNull(),
    /** The account acted upon, when the action is about one. */
    subjectId: uuid("subject_id").references(() => users.id, { onDelete: "set null" }),
    subjectEmail: text("subject_email"),

    /** Enough to reconstruct what was done: amounts, plan codes, reasons. */
    detail: text("detail").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("admin_audit_time_idx").on(table.createdAt)],
);
