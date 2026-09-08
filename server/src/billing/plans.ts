import { CREDIT_COSTS, PODCAST_LENGTHS } from "./costs";

/**
 * The plans, defined in code for the same reason packs are: they are product
 * decisions that ship with a deploy, and a database row that disagreed with the
 * code would be the worst of both.
 *
 * What is *not* in code is what a person was actually granted. Every grant is a
 * ledger row, so changing a plan's credits here changes what future periods
 * grant and never rewrites what somebody already had.
 *
 * Prices are paise. Razorpay works in the smallest currency unit and floating
 * point money is a bug waiting for a rounding mode.
 */
export type PlanLimits = {
  /** Credits granted at the start of each billing period. */
  monthlyCredits: number;
  notebooks: number;
  sourcesPerNotebook: number;
  storageBytes: number;
  /**
   * The longest audio overview this plan may generate, in minutes. Zero means
   * none at all.
   *
   * A length rather than a boolean, because "no audio overviews" turned out to
   * be the wrong gate: somebody who has never heard one has no reason to pay for
   * one. Free gets the two minute length — a real episode, charged at its real
   * cost — and the longer ones are what the paid plans buy.
   */
  maxPodcastMinutes: number;
};

export type Plan = {
  code: string;
  name: string;
  blurb: string;
  pricePaise: number;
  limits: PlanLimits;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Free is deliberately small.
 *
 * Twenty five credits is enough to add a document and have a real conversation
 * about it, which is the only thing the free tier has to prove. It is also the
 * whole exposure: a free account cannot cost more than twenty five answers.
 *
 * A two minute audio overview costs sixteen of those twenty five, which is a
 * deliberate trade rather than an oversight. It is the one feature nobody will
 * pay for without having heard, and spending most of a month's allowance on it
 * is a choice the person makes knowingly — the length picker shows the price.
 */
export const FREE_PLAN: Plan = {
  code: "free",
  name: "Free",
  blurb: "Enough to see whether it answers your questions.",
  pricePaise: 0,
  limits: {
    monthlyCredits: 25,
    notebooks: 2,
    sourcesPerNotebook: 5,
    storageBytes: 25 * MB,
    maxPodcastMinutes: 2,
  },
};

/**
 * Priced against NotebookLM Plus at roughly ₹440 rather than against the dollar
 * tools, because that is the comparison an Indian buyer actually makes.
 *
 * The credit count is set from the cost model, not from what sounds generous.
 * 250 answers cost about ₹200 at the typical rate, leaving a real margin; even
 * if every one of them ran the corrective loop to exhaustion the exposure is
 * bounded at roughly ₹460, because credits are a hard cap rather than a
 * guideline.
 */
export const PLUS_PLAN: Plan = {
  code: "plus",
  name: "Plus",
  blurb: "For one person's documents, with audio overviews.",
  pricePaise: 39_900,
  limits: {
    monthlyCredits: 250,
    notebooks: 15,
    sourcesPerNotebook: 100,
    storageBytes: 2 * GB,
    maxPodcastMinutes: 10,
  },
};

export const PRO_PLAN: Plan = {
  code: "pro",
  name: "Pro",
  blurb: "For heavier use, larger collections and more audio.",
  pricePaise: 99_900,
  limits: {
    monthlyCredits: 600,
    notebooks: 100,
    sourcesPerNotebook: 500,
    storageBytes: 10 * GB,
    maxPodcastMinutes: 10,
  },
};

export const PLANS: Plan[] = [FREE_PLAN, PLUS_PLAN, PRO_PLAN];

const byCode = new Map(PLANS.map((plan) => [plan.code, plan]));

if (byCode.size !== PLANS.length) {
  throw new Error("Two plans share a code");
}

/**
 * The plan for a code, falling back to Free.
 *
 * Falling back rather than throwing is deliberate: a subscription row naming a
 * plan that has since been retired should leave somebody on the free tier, not
 * take down every request they make.
 */
export function planFor(code: string | null | undefined): Plan {
  if (!code) return FREE_PLAN;
  return byCode.get(code) ?? FREE_PLAN;
}

export function isKnownPlan(code: string): boolean {
  return byCode.has(code);
}

/** Paid plans, in price order — what a pricing page renders. */
export function paidPlans(): Plan[] {
  return PLANS.filter((plan) => plan.pricePaise > 0).sort(
    (left, right) => left.pricePaise - right.pricePaise,
  );
}

// A plan whose whole allowance cannot buy even the shortest episode it is
// allowed would offer the action and then refuse it, which is worse than not
// offering it at all.
const SHORTEST_EPISODE = Math.min(...PODCAST_LENGTHS);

for (const plan of PLANS) {
  if (
    plan.limits.maxPodcastMinutes > 0 &&
    plan.limits.monthlyCredits < CREDIT_COSTS.podcast * SHORTEST_EPISODE
  ) {
    throw new Error(`Plan "${plan.code}" allows an episode it cannot afford`);
  }
}
