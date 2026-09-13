/**
 * What a thousand tokens costs, in micro-rupees.
 *
 * Published list prices are in US dollars per million tokens. They are
 * converted once, here, so no other file has to know about currency, and so
 * that a price change is a single edit with a date beside it rather than a
 * number to hunt for.
 *
 * Micro-rupees because a nano-model call costs a small fraction of a paisa and
 * rounding to paise would record most calls as free, which is wrong in the one
 * direction that matters when you are trying to learn your unit economics.
 *
 * These are estimates of the bill, not the bill. The provider's invoice is the
 * truth; this exists so the dashboard can show a number that moves with usage
 * rather than a figure someone typed into a spreadsheet once.
 */

/** Set alongside the prices so nobody has to guess how stale they are. */
export const PRICES_UPDATED = "2026-09-13";

/** Rupees per US dollar, for converting list prices. */
const USD_TO_INR = 88;

/** US dollars per million tokens, as published. */
const USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

/**
 * Falls back to the cheapest listed model rather than to zero.
 *
 * An unknown model is usually a newly configured one, and reporting its cost as
 * zero would quietly understate the bill. Understating is the failure mode to
 * avoid: a number that is too low gets believed.
 */
const FALLBACK = { input: 0.4, output: 1.6 };

function rateFor(model: string): { input: number; output: number } {
  const exact = USD_PER_MILLION[model];
  if (exact) return exact;

  // Configured names often carry a dated suffix, as in gpt-4.1-mini-2026-01-01.
  // Longest match first, so gpt-4.1-mini is not shadowed by gpt-4.1.
  const base = Object.keys(USD_PER_MILLION)
    .filter((known) => model.startsWith(known))
    .sort((a, b) => b.length - a.length)[0];

  return (base && USD_PER_MILLION[base]) || FALLBACK;
}

/** Cost of one call in micro-rupees, rounded to a whole micro-rupee. */
export function costMicros(model: string, promptTokens: number, completionTokens: number): number {
  const rate = rateFor(model);
  const usd =
    (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output;
  return Math.round(usd * USD_TO_INR * 1_000_000);
}

/** For display. Micro-rupees are unreadable; rupees to four places are not. */
export function microsToRupees(micros: number): number {
  return micros / 1_000_000;
}

export function isPricedModel(model: string): boolean {
  return (
    Boolean(USD_PER_MILLION[model]) || Object.keys(USD_PER_MILLION).some((k) => model.startsWith(k))
  );
}
