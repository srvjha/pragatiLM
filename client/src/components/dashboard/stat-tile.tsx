import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One figure on the dashboard.
 *
 * The tile is deliberately rigid. Every instance is a mono label, then the
 * number, then an optional meter, then one quiet line at the very bottom, and
 * the bottom line is pinned there with `mt-auto` so that the baselines line up
 * across a row no matter how long anyone's wording is. A grid of figures is
 * only readable if the eye can scan one band at a time, and it cannot do that
 * if each tile lays itself out to fit its own text.
 */

/** Every tile on the page is this tall, so rows never step up and down. */
const TILE_HEIGHT = "min-h-[8.75rem]";

export type StatMeter = {
  /** 0 to 1. Anything outside is clamped rather than overflowing the track. */
  fraction: number;
  /**
   * Colour is a claim about state here, not decoration: `marker` is the
   * product's "we found and matched something" yellow, `stamp` its "we
   * refused" red. A meter that means neither of those does not get one.
   */
  tone: "marker" | "stamp";
};

export function StatTile({
  label,
  value,
  unit,
  detail,
  note,
  tone = "neutral",
  meter,
}: {
  label: string;
  /** Pre-formatted, so the caller can pass an em-dash for a missing figure. */
  value: string;
  unit?: string;
  /**
   * The counts underneath a rate. "60% refused" over five questions and over
   * five thousand are different facts, so a percentage never ships alone.
   */
  detail?: ReactNode;
  note?: string;
  tone?: "neutral" | "stamp";
  meter?: StatMeter;
}) {
  return (
    <div
      className={cn("bg-card flex flex-col rounded-xl border p-4", TILE_HEIGHT)}
    >
      <dt className="text-muted-foreground font-mono text-[0.65rem] leading-4 font-medium tracking-[0.12em] uppercase">
        {label}
      </dt>

      {/* Three bands: label at the top, figure directly under it, explanation
          pinned to the floor. The figure therefore always sits on the same
          line across a row, and the sentence always sits on the same line,
          whatever is or is not between them. */}
      <dd className="flex flex-1 flex-col">
        <p
          className={cn(
            "tabular mt-2.5 font-mono text-3xl leading-none",
            tone === "stamp" && "text-stamp",
          )}
        >
          {value}
          {unit && (
            <span className="text-muted-foreground ml-1 text-base font-normal">
              {unit}
            </span>
          )}
        </p>

        {detail && (
          <p className="tabular text-muted-foreground mt-2 font-mono text-xs">
            {detail}
          </p>
        )}

        {meter && (
          <div
            className={cn(
              "mt-3 h-1.5 w-full overflow-hidden rounded-full",
              meter.tone === "marker" ? "bg-marker/25" : "bg-stamp/20",
            )}
            aria-hidden
          >
            {/* The track is a light step of the fill's own colour rather than a
                neutral grey, so the whole bar reads as one statement about the
                same thing instead of a fill sitting on unrelated furniture. */}
            <div
              className={cn(
                "h-full rounded-full",
                meter.tone === "marker" ? "bg-marker" : "bg-stamp",
              )}
              style={{
                width: `${Math.min(100, Math.max(0, meter.fraction * 100))}%`,
              }}
            />
          </div>
        )}

        {note && (
          <p className="text-muted-foreground mt-auto line-clamp-2 pt-3 text-xs leading-snug">
            {note}
          </p>
        )}
      </dd>
    </div>
  );
}

/**
 * The loading stand-in. It is a separate component rather than a bare
 * `Skeleton` so it carries the tile's own padding and height constant: the
 * whole point of a skeleton is that nothing moves when the data lands.
 */
export function StatTileSkeleton() {
  return (
    <div
      className={cn("bg-card flex flex-col rounded-xl border p-4", TILE_HEIGHT)}
    >
      <div className="bg-muted h-2.5 w-20 animate-pulse rounded-full motion-reduce:animate-none" />
      <div className="flex flex-1 flex-col">
        <div className="bg-muted mt-2.5 h-7 w-24 animate-pulse rounded motion-reduce:animate-none" />
        <div className="bg-muted mt-auto h-2.5 w-4/5 animate-pulse rounded-full motion-reduce:animate-none" />
      </div>
    </div>
  );
}
