"use client";

import { useId, useState } from "react";
import type { FeatureUsage } from "@/features/admin/api";
import { compact, rupees } from "@/features/admin/format";
import { cn } from "@/lib/utils";

/**
 * Where the AI bill goes, as a donut.
 *
 * A donut is the right form here and wrong in most places: it answers
 * part-to-whole at a glance, which is exactly the question "what is driving the
 * cost", and it is useless for comparing close values, which is why the table
 * beside it carries the actual numbers.
 *
 * FOUR SEGMENTS, NOT SIX. This palette has no accent hue - globals.css says so
 * outright, and reserves its one colour, marker yellow, for citations. So the
 * segments have to be steps of the ink ramp, and a monochrome ramp runs out of
 * separation fast. Running the palette validator: five steps fail the
 * normal-vision floor at dE 8.5 against a floor of 15, meaning a reader with
 * full colour vision cannot reliably tell two neighbouring slices apart. Four
 * widely spaced steps pass at dE 16.5 light and 18.0 dark. So the top three
 * features get a slice each and everything else folds into Other, which is what
 * you do with a category you cannot colour rather than inventing a hue the
 * design system does not have.
 *
 * Both modes warn on contrast for the palest step, which obliges visible labels
 * or a table view. Both are present: every segment is named in the legend with
 * its own value, and the table sits directly beneath.
 */
const SEGMENTS = 4;

/** Validated against #ffffff and #171b22. See the comment above before editing. */
const FILL = [
  "var(--admin-donut-1)",
  "var(--admin-donut-2)",
  "var(--admin-donut-3)",
  "var(--admin-donut-4)",
];

type Slice = { label: string; value: number; share: number; fill: string };

function toSlices(rows: FeatureUsage[]): { slices: Slice[]; total: number } {
  const total = rows.reduce((sum, row) => sum + row.costRupees, 0);
  if (total <= 0) return { slices: [], total: 0 };

  const sorted = [...rows].sort((a, b) => b.costRupees - a.costRupees);
  const head = sorted.slice(0, SEGMENTS - 1);
  const tail = sorted.slice(SEGMENTS - 1);

  const slices: Slice[] = head.map((row, index) => ({
    label: row.feature,
    value: row.costRupees,
    share: row.costRupees / total,
    fill: FILL[index] as string,
  }));

  if (tail.length > 0) {
    const rest = tail.reduce((sum, row) => sum + row.costRupees, 0);
    if (rest > 0) {
      slices.push({
        label:
          tail.length === 1
            ? (tail[0]?.feature ?? "Other")
            : `Other (${tail.length})`,
        value: rest,
        share: rest / total,
        fill: FILL[SEGMENTS - 1] as string,
      });
    }
  }

  return { slices, total };
}

/** Geometry for one segment of a ring, as an SVG path. */
function arc(
  from: number,
  to: number,
  radius: number,
  thickness: number,
): string {
  const inner = radius - thickness;
  const a0 = from * 2 * Math.PI - Math.PI / 2;
  const a1 = to * 2 * Math.PI - Math.PI / 2;
  const large = to - from > 0.5 ? 1 : 0;

  const x0 = Math.cos(a0) * radius;
  const y0 = Math.sin(a0) * radius;
  const x1 = Math.cos(a1) * radius;
  const y1 = Math.sin(a1) * radius;
  const xi1 = Math.cos(a1) * inner;
  const yi1 = Math.sin(a1) * inner;
  const xi0 = Math.cos(a0) * inner;
  const yi0 = Math.sin(a0) * inner;

  return [
    `M ${x0} ${y0}`,
    `A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`,
    `L ${xi1} ${yi1}`,
    `A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0}`,
    "Z",
  ].join(" ");
}

export function CostDonut({
  rows,
  pricesUpdated,
}: {
  rows: FeatureUsage[];
  pricesUpdated: string;
}) {
  const titleId = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const { slices, total } = toSlices(rows);

  if (slices.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No model calls recorded in this window yet.
      </p>
    );
  }

  const RADIUS = 88;
  const THICKNESS = 26;
  // A 2px gap between fills, as a fraction of the circle, so segments read as
  // separate marks rather than one banded ring.
  const GAP = 2 / (2 * Math.PI * RADIUS);

  // Cumulative offsets without mutating during render: the compiler's
  // immutability rule flags a running counter reassigned inside map, and it is
  // right to, because a re-render could resume it mid-way.
  const geometry = slices.map((slice, index) => {
    const from = slices.slice(0, index).reduce((sum, s) => sum + s.share, 0);
    const to = from + slice.share;
    return { slice, from, to: Math.max(from, to - GAP) };
  });

  const focus = hovered === null ? null : geometry[hovered];

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <svg
        viewBox="-100 -100 200 200"
        className="size-[200px] shrink-0"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          AI cost by feature.{" "}
          {slices.map((s) => `${s.label} ${rupees(s.value)}`).join(", ")}.
        </title>

        {geometry.map(({ slice, from, to }, index) => (
          <path
            key={slice.label}
            d={arc(from, to, RADIUS, THICKNESS)}
            fill={slice.fill}
            opacity={hovered === null || hovered === index ? 1 : 0.45}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            className="transition-opacity"
          />
        ))}

        {/* The total sits in the hole, which is the only reason to prefer a
            donut over a pie: the middle is otherwise wasted ink. */}
        <text
          textAnchor="middle"
          className="fill-foreground font-mono text-[19px] font-medium"
          y={focus ? -4 : 4}
        >
          {rupees(focus ? focus.slice.value : total)}
        </text>
        {focus ? (
          <text
            textAnchor="middle"
            y={16}
            className="fill-muted-foreground text-[11px]"
          >
            {focus.slice.label}
          </text>
        ) : null}
      </svg>

      <div className="min-w-0 flex-1">
        <ul className="space-y-1.5">
          {geometry.map(({ slice }, index) => (
            <li
              key={slice.label}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "flex items-baseline gap-2 rounded px-1.5 py-1 text-sm transition-colors",
                hovered === index && "bg-muted",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 translate-y-[1px] rounded-[2px]"
                style={{ background: slice.fill }}
              />
              <span className="text-foreground min-w-0 flex-1 truncate">
                {slice.label}
              </span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {Math.round(slice.share * 100)}%
              </span>
              <span className="text-foreground w-16 text-right font-mono text-xs tabular-nums">
                {rupees(slice.value)}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground mt-3 text-xs">
          Estimated from list prices of {pricesUpdated}. Not an invoice.{" "}
          {compact(rows.reduce((sum, row) => sum + row.tokens, 0))} tokens
          across {rows.reduce((sum, row) => sum + row.calls, 0)} calls.
        </p>
      </div>
    </div>
  );
}
