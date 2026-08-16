import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { creditLedger, payments, subscriptions } from "@/db/schema";
import type { CreditReason, Payment, Subscription } from "@/db/schema";

/**
 * The only place billing queries are written.
 *
 * Every write here is an insert. Nothing in the ledger is ever updated or
 * deleted, so a balance is always explainable by the rows that produced it.
 */
export async function findSubscription(userId: string): Promise<Subscription | undefined> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return row;
}

export type LedgerWrite = {
  userId: string;
  periodStart: Date;
  delta: number;
  reason: CreditReason;
  refType: string;
  refId: string;
  meta?: Record<string, unknown>;
};

/**
 * Writes a ledger entry, or does nothing if that exact entry already exists.
 *
 * The uniqueness is the database's, not this function's: ingestion retries three
 * times and a webhook can arrive twice, and a check-then-insert would let both
 * through under concurrency. Returns whether a row was actually written, which
 * is what callers need to tell "granted" from "already granted".
 */
export async function appendLedgerEntry(entry: LedgerWrite): Promise<boolean> {
  const written = await db
    .insert(creditLedger)
    .values(entry)
    .onConflictDoNothing()
    .returning({ id: creditLedger.id });

  return written.length > 0;
}

/** The balance for one period: the sum of its entries and nothing else. */
export async function balanceForPeriod(userId: string, periodStart: Date): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, userId), eq(creditLedger.periodStart, periodStart)));

  return row?.balance ?? 0;
}

export type SpendOutcome =
  | { outcome: "spent"; balance: number }
  /** The entry already existed, so this work was paid for on an earlier attempt. */
  | { outcome: "already-charged"; balance: number }
  | { outcome: "insufficient"; balance: number; needed: number };

/**
 * Spends credits atomically, or reports that there are not enough.
 *
 * Reading a balance and then spending against it is a read-modify-write: two
 * requests arriving together would both see enough credit and both spend it, and
 * the account would go negative. The advisory lock serialises exactly those, and
 * is released when the transaction ends whether it commits or throws.
 *
 * The lock is keyed on the user, so it never blocks anybody else's request.
 */
export async function spendCredits(
  entry: Omit<LedgerWrite, "delta" | "reason">,
  cost: number,
): Promise<SpendOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${entry.userId}))`);

    const [row] = await tx
      .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(
        and(eq(creditLedger.userId, entry.userId), eq(creditLedger.periodStart, entry.periodStart)),
      );

    const balance = row?.balance ?? 0;

    if (balance < cost) {
      return { outcome: "insufficient", balance, needed: cost };
    }

    const written = await tx
      .insert(creditLedger)
      .values({ ...entry, delta: -cost, reason: "CONSUME" })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id });

    // Already charged on an earlier attempt. The balance is untouched and the
    // caller should proceed, because the work it is paying for is the same work.
    if (written.length === 0) {
      return { outcome: "already-charged", balance };
    }

    return { outcome: "spent", balance: balance - cost };
  });
}

/**
 * A person's receipts, newest first.
 *
 * Capped rather than paginated: a monthly subscription produces twelve rows a
 * year, so two years of history fits on one screen and a page control would be
 * furniture for a list that never needs it.
 */
export async function listPayments(userId: string, limit = 24): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.paidAt))
    .limit(limit);
}
