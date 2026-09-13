"use client";

import { Empty } from "./panel";
import { onDateTime } from "@/features/admin/format";
import type { AuditRow } from "@/features/admin/api";

/**
 * What admins have done.
 *
 * A list rather than a table: every entry is one sentence about one event, and
 * ruling it into columns would make the detail, which is the part worth
 * reading, the narrowest thing on the page.
 *
 * Nothing here is editable, and nothing is filtered. The log is the record that
 * makes a credit grant accountable, so the panel shows it exactly as the server
 * returned it, newest first.
 */
export function AuditLog({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty>
        No admin actions recorded yet. Granting credits to an account writes the
        first entry.
      </Empty>
    );
  }

  return (
    <div className="bg-card rounded-xl border">
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-3">
            <time
              dateTime={row.createdAt}
              className="text-muted-foreground tabular w-32 shrink-0 font-mono text-xs"
            >
              {onDateTime(row.createdAt)}
            </time>

            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-mono text-xs">{row.actorEmail}</span>{" "}
                <span className="text-muted-foreground">
                  {actionPhrase(row.action)}
                </span>
                {row.subjectEmail && (
                  <>
                    {" "}
                    <span className="font-mono text-xs">
                      {row.subjectEmail}
                    </span>
                  </>
                )}
              </p>
              {row.detail && (
                <p className="text-muted-foreground mt-0.5 font-serif text-xs leading-relaxed break-words">
                  {row.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Action codes are written for a database. A log is read by a person, so the
 * known ones are said in English and an unknown one is printed rather than
 * hidden: a new action type must not silently become a blank line.
 */
function actionPhrase(action: string): string {
  if (action === "grant_credits") return "granted credits to";
  return `${action.replace(/[_-]+/g, " ")} on`;
}
