"use client";

import { useState } from "react";
import { Coins, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RelativeTime } from "@/components/notebooks/relative-time";
import {
  Caveat,
  Empty,
  SortHeader,
  TABLE_CLASS,
  TableCard,
  TD_CLASS,
  TH_CLASS,
  useSortedRows,
} from "./panel";
import { GrantDialog } from "./grant-dialog";
import {
  compact,
  count,
  minutes,
  onDate,
  planName,
  rupees,
} from "@/features/admin/format";
import type { AdminUserRow } from "@/features/admin/api";

/**
 * Every account, and what it has cost to serve.
 *
 * Sorted in the browser rather than the server: the rows are a bounded page
 * that has already arrived, so a click on a heading is a comparison, not a
 * round trip.
 *
 * Two columns need a word of warning and get one on the page rather than in a
 * tooltip alone: time spent is a proxy derived from request timestamps, and the
 * cost is an estimate from list prices. Both are said in the header, in a
 * tooltip, and again under the table, because these are the two figures most
 * likely to be quoted at somebody as if they were measurements.
 */

type SortKey =
  | "name"
  | "plan"
  | "createdAt"
  | "minutesSpent"
  | "questions"
  | "sources"
  | "tokens"
  | "costRupees"
  | "lastSeen";

const MINUTES_CAVEAT =
  "A proxy, not a stopwatch. It is the span between the first and last request in each hour, added up, so reading without clicking counts as nothing and a tab left open counts as nothing.";

function sortValue(row: AdminUserRow, key: SortKey): string | number | null {
  if (key === "name") return row.name || row.email;
  if (key === "plan") return row.plan;
  if (key === "createdAt") return Date.parse(row.createdAt);
  if (key === "lastSeen") return row.lastSeen ? Date.parse(row.lastSeen) : null;
  return row[key];
}

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const [granting, setGranting] = useState<AdminUserRow | null>(null);
  const {
    rows: sorted,
    sort,
    toggle,
  } = useSortedRows<AdminUserRow, SortKey>(
    rows,
    { key: "createdAt", direction: "desc" },
    sortValue,
  );

  if (rows.length === 0) {
    return <Empty>No accounts yet.</Empty>;
  }

  return (
    <div>
      <TableCard>
        <table className={`${TABLE_CLASS} min-w-[68rem]`}>
          <caption className="sr-only">
            Accounts, with plan, activity and estimated cost. Sorted by{" "}
            {sort.key}, {sort.direction === "asc" ? "ascending" : "descending"}.
          </caption>
          <thead>
            <tr className="border-b">
              <SortHeader
                column="name"
                label="User"
                sort={sort}
                onSort={toggle}
                preferred="asc"
              />
              <SortHeader
                column="plan"
                label="Plan"
                sort={sort}
                onSort={toggle}
                preferred="asc"
              />
              <SortHeader
                column="createdAt"
                label="Joined"
                sort={sort}
                onSort={toggle}
              />
              <SortHeader
                column="minutesSpent"
                label="Time spent"
                hint="proxy"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="questions"
                label="Questions"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="sources"
                label="Sources"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="tokens"
                label="Tokens"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="costRupees"
                label="AI cost"
                hint="estimate"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <SortHeader
                column="lastSeen"
                label="Last seen"
                sort={sort}
                onSort={toggle}
                align="right"
              />
              <th scope="col" className={`${TH_CLASS} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-accent/40 border-b transition-colors last:border-b-0"
              >
                <td className={`${TD_CLASS} max-w-[18rem]`}>
                  <span className="block truncate font-medium">
                    {row.name || "No name"}
                  </span>
                  <span className="text-muted-foreground block truncate font-mono text-xs">
                    {row.email}
                  </span>
                </td>

                <td className={TD_CLASS}>
                  {/* A paying account is the one worth spotting in a scan, so
                      it gets a chip and a free one gets quiet text. The marker
                      is deliberately not used here: it means the product
                      matched something, not that somebody paid. */}
                  <span
                    className={
                      row.plan === "free"
                        ? "text-muted-foreground text-xs"
                        : "bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs font-medium"
                    }
                  >
                    {planName(row.plan)}
                  </span>
                </td>

                <td className={`${TD_CLASS} text-muted-foreground text-xs`}>
                  {onDate(row.createdAt)}
                </td>

                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {minutes(row.minutesSpent)}
                </td>
                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {count(row.questions)}
                </td>
                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {count(row.sources)}
                </td>
                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {compact(row.tokens)}
                </td>
                <td className={`${TD_CLASS} tabular text-right font-mono`}>
                  {rupees(row.costRupees)}
                </td>

                <td
                  className={`${TD_CLASS} text-muted-foreground text-right text-xs`}
                >
                  {row.lastSeen ? <RelativeTime iso={row.lastSeen} /> : "Never"}
                </td>

                <td className={`${TD_CLASS} text-right`}>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setGranting(row)}
                  >
                    <Coins />
                    Grant
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Caveat>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="What time spent measures"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mr-1.5 inline-flex translate-y-0.5 rounded focus-visible:ring-2 focus-visible:outline-none"
              >
                <Info className="size-3.5" />
              </button>
            }
          />
          <TooltipContent>{MINUTES_CAVEAT}</TooltipContent>
        </Tooltip>
        Time spent is a proxy derived from request timestamps, not measured
        session time. AI cost is estimated from published list prices rather
        than billed. Showing the {rows.length} most recent accounts.
      </Caveat>

      {/* Keyed on the account, so every account opens an empty form rather
          than whatever was typed for the last one. */}
      <GrantDialog
        key={granting?.id ?? "closed"}
        user={granting}
        onClose={() => setGranting(null)}
      />
    </div>
  );
}
