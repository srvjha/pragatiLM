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
 *   podcast  charged PER MINUTE, because that is how it is billed to us:
 *            ~₹25 for a three minute episode on Sarvam (the ₹1,000-is-forty-
 *            episodes note in config/env.ts), so ~₹8 a minute, so eight credits.
 *            A flat weight made a ten minute episode cost the same as a three
 *            minute one while costing us three times as much — the only action
 *            that can lose real money if its length is free.
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
  /** Per minute of audio, not per episode. See PODCAST_LENGTHS below. */
  podcast: 8,
} as const;

/**
 * The lengths on offer, shortest first.
 *
 * Two minutes exists so a plan that cannot afford a full episode can still hear
 * one. It is a real episode rather than a truncated one — the script is written
 * to the length — because a preview that stops mid-sentence advertises a fault
 * rather than the product.
 */
export const PODCAST_LENGTHS = [2, 3, 6, 10] as const;
export type PodcastLength = (typeof PODCAST_LENGTHS)[number];

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
 *
 * `units` is carried because a refund has to return what was actually taken. A
 * ten minute episode is charged eighty credits, and refunding the one-unit
 * default would hand back eight of them.
 */
export type CreditCharge = { userId: string; ref: string; units?: number };

export function creditsFor(action: BillableAction): number {
  return CREDIT_COSTS[action];
}
