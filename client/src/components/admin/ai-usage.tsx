"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Caveat,
  Empty,
  TABLE_CLASS,
  TableCard,
  TD_CLASS,
  TH_CLASS,
} from "./panel";
import {
  compact,
  count,
  onDate,
  percent,
  rupees,
} from "@/features/admin/format";
import type { FeatureUsage } from "@/features/admin/api";

/**
 * What the model spend is going on.
 *
 * The chart plots one measure, cost, across features that have no order of
 * their own, so every bar is the same colour: colouring them by value would
 * spend the identity channel re-encoding the length the bar already shows, and
 * a rank based palette would repaint the survivors the moment the window
 * changes. Tokens and calls sit in the table underneath rather than in a second
 * series, because tokens and rupees do not share a scale and putting them on
 * one plot would invent a relationship between them.
 *
 * The costs are estimates throughout, and the panel says so in the one place
 * somebody would look before quoting the figure at somebody else.
 */

/** The bar itself is thin: the data is the only thing allowed to be loud. */
const BAR_HEIGHT = "h-2.5";

export function AiUsage({
  rows,
  days,
  pricesUpdated,
}: {
  rows: FeatureUsage[];
  days: number;
  /** ISO date the price table was last edited, from the overview. */
  pricesUpdated: string | null;
}) {
  if (rows.length === 0) {
    return (
      <Empty>
        No model calls in the last {days} days. Cost and tokens appear here once
        a notebook is used.
      </Empty>
    );
  }

  const totalCost = rows.reduce((sum, row) => sum + row.costRupees, 0);
  const peak = Math.max(...rows.map((row) => row.costRupees), 0);

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-muted-foreground font-serif text-xs">
            <span className="tabular text-foreground font-mono">
              {rupees(totalCost)}
            </span>{" "}
            estimated across {rows.length}{" "}
            {rows.length === 1 ? "feature" : "features"} in {days} days
          </p>
          <p className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.12em] uppercase">
            Cost by feature
          </p>
        </div>

        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.feature}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      // The whole row is the hit target, not the painted bar:
                      // a 10px mark is a pinpoint nobody lands on reliably.
                      className="hover:bg-accent/50 focus-visible:ring-ring/50 -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="text-muted-foreground w-28 shrink-0 truncate font-mono text-[0.65rem] tracking-[0.08em] uppercase">
                        {featureLabel(row.feature)}
                      </span>

                      <span className="flex min-w-0 flex-1 items-center">
                        <span
                          className={`bg-chart-1 block rounded-r-[4px] ${BAR_HEIGHT}`}
                          style={{
                            width: `${barWidth(row.costRupees, peak)}%`,
                          }}
                          aria-hidden="true"
                        />
                      </span>

                      {/* The value rides the tip of every bar. With this few
                          rows a label on each is a table of five numbers, not
                          the flood that makes direct labels stop working. */}
                      <span className="tabular w-20 shrink-0 text-right font-mono text-xs">
                        {rupees(row.costRupees)}
                      </span>
                    </button>
                  }
                />
                <TooltipContent>
                  {rupees(row.costRupees)} estimated over {count(row.calls)}{" "}
                  calls and {compact(row.tokens)} tokens
                </TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      </div>

      <TableCard>
        <table className={TABLE_CLASS}>
          <caption className="sr-only">
            Model calls, tokens and estimated cost by feature over the last{" "}
            {days} days
          </caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={TH_CLASS}>
                Feature
              </th>
              <th scope="col" className={`${TH_CLASS} text-right`}>
                Calls
              </th>
              <th scope="col" className={`${TH_CLASS} text-right`}>
                Tokens
              </th>
              <th scope="col" className={`${TH_CLASS} text-right`}>
                Cost (est.)
              </th>
              <th scope="col" className={`${TH_CLASS} text-right`}>
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature} className="border-b last:border-b-0">
                <td className={TD_CLASS}>{featureLabel(row.feature)}</td>
                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {count(row.calls)}
                </td>
                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {compact(row.tokens)}
                </td>
                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {rupees(row.costRupees)}
                </td>
                <td
                  className={`${TD_CLASS} tabular text-muted-foreground text-right font-mono`}
                >
                  {totalCost > 0 ? percent(row.costRupees / totalCost, 0) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td className={`${TD_CLASS} font-medium`}>Total</td>
              <td className={`${TD_CLASS} tabular text-right font-mono`}>
                {count(rows.reduce((sum, row) => sum + row.calls, 0))}
              </td>
              <td className={`${TD_CLASS} tabular text-right font-mono`}>
                {compact(rows.reduce((sum, row) => sum + row.tokens, 0))}
              </td>
              <td
                className={`${TD_CLASS} tabular text-right font-mono font-medium`}
              >
                {rupees(totalCost)}
              </td>
              <td className={TD_CLASS} />
            </tr>
          </tfoot>
        </table>
      </TableCard>

      <Caveat>
        Cost is an estimate, not a bill. It is calculated from published list
        prices
        {pricesUpdated ? ` last updated on ${onDate(pricesUpdated)}` : ""},
        multiplied by the tokens each call reported. Discounts, free tiers,
        cached input and taxes are not in it, so the provider invoice will
        differ.
      </Caveat>
    </div>
  );
}

/**
 * A feature with a real but tiny cost keeps a visible sliver, so "almost
 * nothing" and "nothing" never render as the same empty row.
 */
function barWidth(value: number, peak: number): number {
  if (peak <= 0 || value <= 0) return 0;
  return Math.max(1.5, (value / peak) * 100);
}

/** Feature keys arrive as identifiers. A heading should read as English. */
function featureLabel(feature: string): string {
  const words = feature.replace(/[_-]+/g, " ").trim();
  if (!words) return "Unknown";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
