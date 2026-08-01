import type { PodcastTurn } from "@/types/api";

/**
 * Where each turn of an episode falls in its audio.
 *
 * This is the rule the follow-along transcript is built on, and it has two
 * modes that a reader has to be able to tell apart.
 *
 * Synthesis measures every segment as it is made and records the offsets on the
 * turn, so a recent episode is exact. Anything made before that was recorded
 * has no timings at all, and rather than leave those transcripts inert the
 * spans are apportioned by how much text each turn holds. That is an estimate:
 * speech rate varies with sentence shape, numbers and acronyms take longer than
 * their character count implies, and the error accumulates over a dozen turns.
 *
 * Which is why `measured` comes back alongside the spans rather than being
 * inferred by the caller. A timestamp printed to the second claims a precision
 * an apportioned guess does not have, so the caller needs to know which it is
 * holding.
 */
export type Span = { start: number; end: number };

export type Timeline = {
  spans: Span[];
  /** True only when every turn carried its own measured offsets. */
  measured: boolean;
};

export function episodeTimeline(
  turns: PodcastTurn[],
  totalSec: number,
): Timeline {
  const measured =
    turns.length > 0 &&
    turns.every(
      (turn) =>
        typeof turn.startSec === "number" && typeof turn.endSec === "number",
    );

  if (measured) {
    return {
      measured,
      spans: turns.map((turn) => ({
        start: turn.startSec ?? 0,
        end: turn.endSec ?? 0,
      })),
    };
  }

  // Guarded so an episode of empty turns divides by one rather than by zero.
  const characters =
    turns.reduce((sum, turn) => sum + turn.text.length, 0) || 1;
  let elapsed = 0;

  return {
    measured,
    spans: turns.map((turn) => {
      const start = elapsed;
      elapsed += (turn.text.length / characters) * totalSec;
      return { start, end: elapsed };
    }),
  };
}

/**
 * Which turn is being spoken at `at` seconds, or -1 before the first and after
 * the last. Half open on purpose: a turn's end is the next turn's start, so a
 * closed interval would report two turns at every boundary.
 */
export function turnAt(spans: Span[], at: number): number {
  return spans.findIndex((span) => at >= span.start && at < span.end);
}

/** The speeds the player cycles through, in order. */
export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

export function nextRate(rate: number): number {
  const index = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
}
