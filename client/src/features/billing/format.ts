import type { PlanDto } from "@/types/api";

/**
 * Money arrives as paise and is only ever divided for display.
 *
 * `Math.round` before dividing rather than after: every price here is a whole
 * number of paise, and rounding the rupee value would be the one place a
 * fraction could appear in something a person is about to be charged.
 */
export function rupees(pricePaise: number): string {
  if (pricePaise === 0) return "Free";
  return `₹${Math.round(pricePaise / 100).toLocaleString("en-IN")}`;
}

export function storageLabel(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** "3 credits left" reads better than "3 credit left". */
export function credits(count: number): string {
  return `${count.toLocaleString("en-IN")} credit${count === 1 ? "" : "s"}`;
}

export function planLimits(plan: PlanDto): string[] {
  return [
    `${plan.monthlyCredits.toLocaleString("en-IN")} credits a month`,
    `${plan.notebooks} notebooks`,
    `${plan.sourcesPerNotebook} sources per notebook`,
    `${storageLabel(plan.storageBytes)} of storage`,
    plan.podcasts ? "Audio overviews" : "No audio overviews",
  ];
}

/**
 * When the allowance comes back, in the reader's own words.
 *
 * A date on its own ("resets 1 September") makes somebody count days. "in 6
 * days" is what they actually wanted to know, and the date is kept alongside for
 * the ones who want to plan.
 */
export function resetsIn(periodEnd: string): string {
  const end = new Date(periodEnd);
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);

  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "resets today";
  if (days === 1) return "resets tomorrow";
  return `resets in ${days} days`;
}
