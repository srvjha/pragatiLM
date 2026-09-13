"use client";

import {
  Caveat,
  Empty,
  SortHeader,
  TABLE_CLASS,
  TableCard,
  TD_CLASS,
  useSortedRows,
} from "./panel";
import { count, millis, percent } from "@/features/admin/format";
import type { RoutePerformance } from "@/features/admin/api";
import { cn } from "@/lib/utils";

/**
 * Where the time goes, by route.
 *
 * A table rather than a chart, and deliberately: forty routes is well past the
 * point where colour classes stop being distinguishable, and the question this
 * panel answers is "which route is slow and how badly", which is four numbers
 * per row, not a shape.
 *
 * Sorted by p95 by default, because p95 is the latency a person actually
 * notices. The error column wears the stamp when it is not zero: a failing
 * route means something, so it gets the colour that means refusal everywhere
 * else in the product, paired with the figure itself rather than standing in
 * for it.
 */

type SortKey =
  "route" | "requests" | "errorRate" | "p50" | "p95" | "p99" | "maxMs";

function sortValue(row: RoutePerformance, key: SortKey): string | number {
  if (key === "route") return `${row.method} ${row.route}`;
  return row[key];
}

export function PerformanceTable({
  rows,
  days,
}: {
  rows: RoutePerformance[];
  days: number;
}) {
  const {
    rows: sorted,
    sort,
    toggle,
  } = useSortedRows<RoutePerformance, SortKey>(
    rows,
    { key: "p95", direction: "desc" },
    sortValue,
  );

  if (rows.length === 0) {
    return (
      <Empty>
        No requests recorded in the last {days} days. Timings appear as soon as
        the API is used.
      </Empty>
    );
  }

  return (
    <div>
      <TableCard>
        <table className={`${TABLE_CLASS} min-w-[54rem]`}>
          <caption className="sr-only">
            Request count, error rate and latency percentiles by route over the
            last {days} days
          </caption>
          <thead>
            <tr className="border-b">
              <SortHeader
                column="route"
                label="Route"
                sort={sort}
                onSort={toggle}
                preferred="asc"
              />
              <SortHeader
                column="requests"
                label="Requests"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="errorRate"
                label="Errors"
                hint="5xx only"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="p50"
                label="p50"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="p95"
                label="p95"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="p99"
                label="p99"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="maxMs"
                label="Max"
                sort={sort}
                onSort={toggle}
                align="right"
              />
            </tr>
          </thead>

          <tbody>
            {sorted.map((row) => (
              <tr
                key={`${row.method} ${row.route}`}
                className="hover:bg-accent/40 border-b transition-colors last:border-b-0"
              >
                <td className={`${TD_CLASS} max-w-[26rem]`}>
                  <span className="text-muted-foreground mr-2 font-mono text-[0.65rem] tracking-[0.08em]">
                    {row.method}
                  </span>
                  <span className="font-mono text-xs">{row.route}</span>
                </td>

                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {count(row.requests)}
                </td>

                <td
                  className={cn(
                    TD_CLASS,
                    "tabular text-right font-mono",
                    row.errorRate > 0 ? "text-stamp" : "text-muted-foreground",
                  )}
                >
                  {percent(row.errorRate)}
                </td>

                <td
                  className={`${TD_CLASS} tabular text-muted-foreground text-right font-mono`}
                >
                  {millis(row.p50)}
                </td>
                {/* p95 is the column the table is about, so it is the one that
                    keeps full contrast while its neighbours recede. */}
                <td
                  className={`${TD_CLASS} tabular text-right font-mono font-medium`}
                >
                  {millis(row.p95)}
                </td>
                <td
                  className={`${TD_CLASS} tabular text-muted-foreground text-right font-mono`}
                >
                  {millis(row.p99)}
                </td>
                <td
                  className={`${TD_CLASS} tabular text-muted-foreground text-right font-mono`}
                >
                  {millis(row.maxMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Caveat>
        Only a 5xx counts as an error here. A refusal, an exhausted allowance or
        a request for something that was deleted are all the product working,
        and folding them in would make this column useless as an alarm. Slowest
        forty routes by p95.
      </Caveat>
    </div>
  );
}
