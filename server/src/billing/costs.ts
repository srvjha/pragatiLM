/**
 * What each action costs in credits.
 *
 * One credit is one chat answer, because that is the action people count. Every
 * other weight is that action's real marginal cost expressed in the same unit,
 * measured against the calls the pipeline actually makes:
 *
 *   chat     ~$0.009 typical, ~$0.021 worst case when the corrective loop runs
 *            all four rounds. Reranking and the two grader calls dominate; the
 *            generation itself is under a third of it.
 *   podcast  ~₹25 an episode on Sarvam, which is where the ₹1,000-is-forty-
 *            episodes note in config/env.ts comes from. Twenty five times a
 *            chat answer, and the only action that can lose real money if it
 *            is given away.
 *   roadmap  one generation over the whole notebook, so a few answers' worth.
 *   source   embedding a fifty page PDF is about $0.0005, which is nothing. The
 *            credit is for the storage it occupies from then on, not the
 *            compute it took.
 *
 * These are weights, not prices. The rupee value of a credit lives in plans.ts.
 */
export const CREDIT_COSTS = {
  chat: 1,
  source: 1,
  roadmap: 3,
  podcast: 25,
} as const;

export type BillableAction = keyof typeof CREDIT_COSTS;

/**
 * Carried on a job so the work it does can be refunded if it never delivers.
 *
 * `userId` travels with the job rather than being looked up from the notebook,
 * because a refund must not depend on a second query succeeding at the exact
 * moment something has already gone wrong.
 *
 * `ref` is what makes the refund idempotent. It is the identity of the *work*,
 * not of the request — a message id, a podcast id, a source id — so a job that
 * fails repeatedly refunds once, and one upload carrying ten PDFs can refund the
 * three that failed independently of the seven that did not.
 */
export type CreditCharge = { userId: string; ref: string };

export function creditsFor(action: BillableAction): number {
  return CREDIT_COSTS[action];
}
