import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  // Payment failed but the period has not run out. Entitlements are unchanged
  // during this window; it exists so a card that fails on a Tuesday does not
  // lock somebody out of documents they are in the middle of reading.
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
]);

/**
 * One row per user who has ever paid. Absence means the free plan, so there is
 * nothing to backfill and no nullable ambiguity about what a missing row means.
 *
 * `planCode` is a plain varchar rather than an enum because plans are defined in
 * code (src/billing/plans.ts) and adding one should not need a migration. The
 * cost is that a value here can name a retired plan, so readers resolve it
 * through planFor(), which falls back to free.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planCode: varchar("plan_code", { length: 40 }).notNull(),
    status: subscriptionStatusEnum("status").notNull().default("ACTIVE"),
    /** "razorpay". Named rather than assumed, so a second provider is additive. */
    provider: varchar("provider", { length: 20 }).notNull(),
    /** The provider's subscription id, for reconciling against their dashboard. */
    providerRef: text("provider_ref"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: timestamp("cancel_at_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One live subscription per person. A second one would make "which plan am
    // I on" ambiguous at exactly the moment it matters.
    uniqueIndex("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_provider_ref_idx").on(table.providerRef),
  ],
);

export const creditReasonEnum = pgEnum("credit_reason", [
  // The period's allowance, written once when a period begins.
  "GRANT",
  "CONSUME",
  // Work that was charged for and then failed. Returning the credit is the
  // difference between a bounded cost and a bill for something never delivered.
  "REFUND",
  // Support and goodwill. Every one is a row, so it can be explained later.
  "ADJUSTMENT",
]);

/**
 * The credit ledger: append only, never updated, never deleted.
 *
 * A running balance column would be faster and would eventually be wrong. The
 * balance is the sum of the deltas for the current period, which cannot drift
 * from the entries because it *is* the entries. When somebody asks where their
 * credits went, the answer is a query rather than an apology.
 *
 * Credits do not roll over. Scoping every row to `periodStart` means expiry
 * needs no job and no sweep: a new period simply sums to a different set of
 * rows.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Which billing period this entry belongs to. Balances never cross one. */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    /** Positive grants, negative consumption. Summed, never overwritten. */
    delta: integer("delta").notNull(),
    reason: creditReasonEnum("reason").notNull(),
    /** What was charged for: "message", "podcast", "source", "roadmap". */
    refType: varchar("ref_type", { length: 30 }),
    /** The id of that thing, so a charge can be traced to the work it bought. */
    refId: varchar("ref_id", { length: 80 }),
    /** Free-form context for adjustments and refunds. */
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("credit_ledger_user_period_idx").on(table.userId, table.periodStart),
    // Idempotency, enforced by the database rather than by remembering to check.
    // Ingestion retries three times and a webhook can be delivered twice; without
    // this, either would charge twice for one piece of work.
    uniqueIndex("credit_ledger_entry_idx").on(
      table.userId,
      table.reason,
      table.refType,
      table.refId,
    ),
  ],
);

/**
 * Every webhook Razorpay sends, stored before it is acted on.
 *
 * This is the audit trail for a payment dispute, and it cannot be reconstructed
 * afterwards. It also carries the idempotency key: providers retry, and a
 * duplicate delivery that granted a second period is the classic version of this
 * bug.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 20 }).notNull(),
    /** The provider's own event id. Unique, so a redelivery is a no-op. */
    providerEventId: text("provider_event_id").notNull(),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    payload: jsonb("payload").notNull(),
    /** Null until handled, so a crash mid-handling is visible rather than silent. */
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_events_provider_event_idx").on(table.provider, table.providerEventId),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type CreditReason = (typeof creditReasonEnum.enumValues)[number];
