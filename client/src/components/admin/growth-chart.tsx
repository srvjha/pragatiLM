"use client";

import { useMemo, useState } from "react";
import { Empty } from "./panel";
import { useElementWidth } from "@/lib/use-element-width";
import { count, onDay, onDate } from "@/features/admin/format";
import type { SignupPoint } from "@/features/admin/api";
import { cn } from "@/lib/utils";

/**
 * Signups and active users, one point a day.
 *
 * Two series, one axis. They are both counts of people per day, so they share a
 * scale and a baseline: a second axis would let two unrelated slopes be read as
 * if they tracked each other, which is the one comparison this chart must not
 * invite.
 *
 * Colour. This product has no accent hue by design, and its two colours are
 * claims rather than decoration: the marker means "found and matched", the
 * stamp means "refused". Neither is free to stand for a series, so identity is
 * carried by two steps of the ink ramp instead, the same pair the user facing
 * dashboard already uses. That fails a categorical palette's chroma floor by
 * construction and passes the checks that decide whether a reader can actually
 * tell the lines apart: the pair separates by a colour difference of 31 in
 * light and 23 in dark under normal vision and under simulated protanopia and
 * deuteranopia alike, and both steps clear 3:1 against the card. On top of that
 * the identity never rests on colour at all, since both lines are direct
 * labelled at their ends, a legend names them, and the numbers are one
 * disclosure away in a table.
 *
 * Drawn by hand rather than with a charting library. The app ships no chart
 * dependency and this is two polylines; adding one would cost more to download
 * than this whole page.
 */

/** The plot, not counting the band under it that carries the dates. */
const PLOT_HEIGHT = 168;
const MARGIN = { top: 10, right: 46, bottom: 22, left: 42 };
const SVG_HEIGHT = PLOT_HEIGHT + MARGIN.top + MARGIN.bottom;

type Series = {
  key: "signups" | "active";
  label: string;
  /** Tailwind colour utilities, so both themes flip with the page. */
  stroke: string;
  fill: string;
};

const SERIES: Series[] = [
  {
    key: "signups",
    label: "Signups",
    stroke: "stroke-chart-1",
    fill: "fill-chart-1",
  },
  {
    key: "active",
    label: "Active users",
    stroke: "stroke-chart-2",
    fill: "fill-chart-2",
  },
];

export function GrowthChart({
  points,
  days,
}: {
  points: SignupPoint[];
  days: number;
}) {
  const [wrap, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const totals = useMemo(
    () => ({
      signups: points.reduce((sum, point) => sum + point.signups, 0),
      peakActive: points.reduce(
        (peak, point) => Math.max(peak, point.active),
        0,
      ),
    }),
    [points],
  );

  const scale = useMemo(() => {
    const highest = points.reduce(
      (peak, point) => Math.max(peak, point.signups, point.active),
      0,
    );
    const step = niceStep(Math.max(1, highest) / 4);
    const max = step * 4;
    return { max, ticks: [0, step, step * 2, step * 3, max] };
  }, [points]);

  if (
    points.length === 0 ||
    (totals.signups === 0 && totals.peakActive === 0)
  ) {
    return (
      <Empty>
        Nobody has signed up or made a request in the last {days} days. The two
        lines start as soon as either happens.
      </Empty>
    );
  }

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const bandStep = innerWidth / Math.max(1, points.length - 1);

  const x = (index: number) => MARGIN.left + bandStep * index;
  const y = (value: number) =>
    MARGIN.top + PLOT_HEIGHT - (value / scale.max) * PLOT_HEIGHT;

  const path = (key: Series["key"]) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${x(index)} ${y(point[key])}`,
      )
      .join(" ");

  const last = points.length - 1;
  // Two end labels that land on top of each other read as one wrong number, so
  // when the lines converge at the right edge the pair is pushed apart.
  const endGap = Math.abs(y(points[last].signups) - y(points[last].active));
  const nudge = endGap < 13 ? 7 : 0;
  const endOffset: Record<Series["key"], number> =
    points[last].signups >= points[last].active
      ? { signups: -nudge, active: nudge }
      : { signups: nudge, active: -nudge };

  // Dates across the bottom, spaced by how much room there actually is rather
  // than by how many points there are: at phone width a label every fifth day
  // printed "9 Se13 Sept" over itself.
  const LABEL_WIDTH = 58;
  const maxLabels = Math.min(8, Math.max(2, Math.floor(innerWidth / 110)));
  const labelEvery = Math.max(1, Math.ceil(points.length / maxLabels));
  /** The last day is always labelled, so anything crowding it is dropped. */
  const labelled = (index: number) =>
    index === last ||
    (index % labelEvery === 0 && x(last) - x(index) > LABEL_WIDTH);

  const point = active === null ? null : points[active];

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-muted-foreground font-serif text-xs">
          <span className="tabular text-foreground font-mono">
            {count(totals.signups)}
          </span>{" "}
          signups in {days} days, peaking at{" "}
          <span className="tabular text-foreground font-mono">
            {count(totals.peakActive)}
          </span>{" "}
          active in a day
        </p>

        {/* The legend is always present with two series. The direct labels at
            the line ends supplement it; neither is asked to work alone. */}
        <ul className="text-muted-foreground flex items-center gap-4 text-xs">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-[2px] w-4 rounded-full",
                  keyColour(series.key),
                )}
                aria-hidden="true"
              />
              {series.label}
            </li>
          ))}
        </ul>
      </div>

      <div
        ref={wrap}
        className="relative"
        style={{ height: SVG_HEIGHT }}
        tabIndex={0}
        role="group"
        aria-label={`Signups and active users a day over the last ${days} days. Use the arrow keys to read a day.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            setActive((current) => {
              const start = current ?? last;
              const next = start + (event.key === "ArrowRight" ? 1 : -1);
              return Math.min(last, Math.max(0, next));
            });
          } else if (event.key === "Home") {
            event.preventDefault();
            setActive(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setActive(last);
          } else if (event.key === "Escape") {
            setActive(null);
          }
        }}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={SVG_HEIGHT}
            className="block overflow-visible"
            aria-hidden="true"
          >
            {/* Gridlines and axis: solid hairlines, one step off the surface,
                so they sit behind the data rather than beside it. */}
            {scale.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={y(tick) + 3}
                  textAnchor="end"
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {count(tick)}
                </text>
              </g>
            ))}

            {/* The highlighter over the day being read. It is the product's own
                gesture rather than a hairline crosshair: this is the span you
                asked about, marked the way every citation in the app is. */}
            {active !== null && (
              <rect
                x={x(active) - Math.max(3, bandStep / 2)}
                y={MARGIN.top}
                width={Math.max(6, bandStep)}
                height={PLOT_HEIGHT}
                className="fill-marker opacity-40"
              />
            )}

            {SERIES.map((series) => (
              <path
                key={series.key}
                d={path(series.key)}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={series.stroke}
              />
            ))}

            {/* End markers and their direct labels. The ring is the card colour
                so the two dots stay legible where the lines cross. */}
            {SERIES.map((series) => (
              <g key={series.key}>
                <circle
                  cx={x(last)}
                  cy={y(points[last][series.key])}
                  r={4}
                  className={cn(series.fill, "stroke-card")}
                  strokeWidth={2}
                />
                <text
                  x={x(last) + 9}
                  y={y(points[last][series.key]) + 3 + endOffset[series.key]}
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {count(points[last][series.key])}
                </text>
              </g>
            ))}

            {/* The point being read, on both lines at once, so the pointer
                never has to land on a 2px line to get a value. */}
            {active !== null &&
              SERIES.map((series) => (
                <circle
                  key={series.key}
                  cx={x(active)}
                  cy={y(points[active][series.key])}
                  r={4}
                  className={cn(series.fill, "stroke-card")}
                  strokeWidth={2}
                />
              ))}

            {points.map((day, index) =>
              labelled(index) ? (
                <text
                  key={day.day}
                  x={x(index)}
                  y={MARGIN.top + PLOT_HEIGHT + 15}
                  textAnchor={index === last ? "end" : "middle"}
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {onDay(day.day)}
                </text>
              ) : null,
            )}

            {/* The hit layer. The reader aims at a date, not at a line. */}
            <rect
              x={MARGIN.left - bandStep / 2}
              y={MARGIN.top}
              width={innerWidth + bandStep}
              height={PLOT_HEIGHT}
              fill="transparent"
              aria-hidden="true"
              style={{ pointerEvents: "all" }}
              onPointerMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const offset = event.clientX - box.left - bandStep / 2;
                const index = Math.round(offset / (bandStep || 1));
                setActive(Math.min(last, Math.max(0, index)));
              }}
              onPointerLeave={() => setActive(null)}
            />
          </svg>
        )}

        {point && width > 0 && (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-lg border px-2.5 py-1.5 shadow-sm"
            style={{
              left: Math.min(Math.max(x(active ?? 0), 72), width - 72),
            }}
            role="status"
          >
            <p className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.08em] uppercase">
              {onDate(point.day)}
            </p>
            <ul className="mt-1 space-y-0.5">
              {SERIES.map((series) => (
                <li
                  key={series.key}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span
                    className={cn(
                      "h-[2px] w-3 shrink-0 rounded-full",
                      keyColour(series.key),
                    )}
                    aria-hidden="true"
                  />
                  <span className="tabular font-mono font-semibold">
                    {count(point[series.key])}
                  </span>
                  <span className="text-muted-foreground">
                    {series.label.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* The table twin. Every value in the plot is readable without a pointer,
          which is what keeps the tooltip an enhancement rather than the only
          way to get a number. */}
      <details className="group mt-3">
        <summary className="text-muted-foreground hover:text-foreground marker:content-none flex cursor-pointer list-none items-center gap-1.5 font-mono text-[0.65rem] tracking-[0.12em] uppercase">
          <span className="group-open:hidden">Show the numbers</span>
          <span className="hidden group-open:inline">Hide the numbers</span>
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Signups and active users a day for the last {days} days
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="bg-card text-muted-foreground sticky top-0 px-3 py-1.5 text-left font-mono text-[0.65rem] tracking-[0.12em] uppercase"
                >
                  Day
                </th>
                <th
                  scope="col"
                  className="bg-card text-muted-foreground sticky top-0 px-3 py-1.5 text-right font-mono text-[0.65rem] tracking-[0.12em] uppercase"
                >
                  Signups
                </th>
                <th
                  scope="col"
                  className="bg-card text-muted-foreground sticky top-0 px-3 py-1.5 text-right font-mono text-[0.65rem] tracking-[0.12em] uppercase"
                >
                  Active
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((day) => (
                <tr key={day.day} className="border-t">
                  <td className="px-3 py-1.5">{onDate(day.day)}</td>
                  <td className="tabular px-3 py-1.5 text-right font-mono">
                    {count(day.signups)}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right font-mono">
                    {count(day.active)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** The legend and tooltip keys mirror the mark: a short stroke, not a box. */
function keyColour(key: Series["key"]): string {
  return key === "signups" ? "bg-chart-1" : "bg-chart-2";
}

/**
 * A gridline step a person would have chosen: 1, 2, 5 or 10 times a power of
 * ten, never 3.7. Counts are whole, so the step never goes below one.
 */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) *
    magnitude;
  return Math.max(1, Math.round(step));
}
