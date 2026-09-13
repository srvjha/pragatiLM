"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The furniture every panel on the admin page is built from.
 *
 * Six panels that each invented their own heading, their own table rules and
 * their own empty state would read as six dashboards stapled together, so the
 * chrome lives here and the panels only supply content.
 */

export function Panel({
  id,
  title,
  blurb,
  aside,
  dimmed = false,
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  /** The window this panel is showing, or anything else that belongs beside
      the heading rather than inside the panel body. */
  aside?: ReactNode;
  /**
   * True while a refetch is in flight. The previous render is held at reduced
   * opacity rather than replaced by skeletons, so changing the range never
   * moves the page under the pointer.
   */
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
        <h2 id={`${id}-heading`} className="text-sm font-semibold">
          {title}
        </h2>
        {blurb && (
          <p className="text-muted-foreground font-serif text-xs">{blurb}</p>
        )}
        {aside && (
          <div className="text-muted-foreground ml-auto font-mono text-[0.65rem] tracking-[0.12em] uppercase">
            {aside}
          </div>
        )}
      </div>
      <div
        className={cn(
          "transition-opacity duration-150 motion-reduce:transition-none",
          dimmed && "opacity-55",
        )}
        aria-busy={dimmed || undefined}
      >
        {children}
      </div>
    </section>
  );
}

/** A panel with nothing in it yet. Dashed, so the space reads as reserved. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-7 text-center font-serif text-sm leading-relaxed">
      <p className="mx-auto max-w-md">{children}</p>
    </div>
  );
}

/** One quiet line under a table, for the caveat that belongs with the data. */
export function Caveat({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground mt-2.5 font-serif text-xs leading-relaxed">
      {children}
    </p>
  );
}

export function PanelError({ children }: { children: ReactNode }) {
  return (
    <p className="border-stamp/30 bg-stamp/5 text-stamp rounded-xl border px-4 py-3 text-sm">
      {children}
    </p>
  );
}

/**
 * A card that holds a table. The scroll container is here rather than on the
 * page, so a wide table scrolls inside its own panel instead of pushing the
 * whole dashboard sideways on a phone.
 */
export function TableCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card overflow-hidden rounded-xl border", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const TABLE_CLASS = "w-full min-w-[44rem] border-collapse text-sm";

export const TH_CLASS =
  "text-muted-foreground bg-card sticky top-0 px-3 py-2 text-left font-mono text-[0.65rem] leading-4 font-medium tracking-[0.12em] whitespace-nowrap uppercase";

export const TD_CLASS = "px-3 py-2.5 align-middle whitespace-nowrap";

/**
 * Client side sorting for a table that is already fully loaded.
 *
 * Every one of these tables is a bounded page of rows the server already sent,
 * so sorting is a comparison rather than a request. Nulls sort last in both
 * directions: an account that has never been seen is not the most recent one
 * just because the column is descending.
 */
export type SortDirection = "asc" | "desc";

export function useSortedRows<Row, Key extends string>(
  rows: Row[] | undefined,
  initial: { key: Key; direction: SortDirection },
  value: (row: Row, key: Key) => string | number | null,
) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    if (!rows) return [];

    const factor = sort.direction === "asc" ? 1 : -1;

    return [...rows].sort((left, right) => {
      const a = value(left, sort.key);
      const b = value(right, sort.key);

      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;

      if (typeof a === "number" && typeof b === "number") {
        return (a - b) * factor;
      }
      return String(a).localeCompare(String(b)) * factor;
    });
    // `value` is a stable function in every caller, and listing it here would
    // re-sort on each render for callers that define it inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  function toggle(key: Key, preferred: SortDirection = "desc") {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: preferred },
    );
  }

  return { rows: sorted, sort, toggle };
}

/**
 * A sortable column heading.
 *
 * The active column is marked with the marker, which is the same claim it makes
 * everywhere else in the product: this is the thing you picked. The arrow says
 * which way, so the state never rests on colour alone.
 */
export function SortHeader<Key extends string>({
  column,
  label,
  sort,
  onSort,
  align = "left",
  preferred = "desc",
  hint,
  className,
}: {
  column: Key;
  label: string;
  sort: { key: Key; direction: SortDirection };
  onSort: (key: Key, preferred?: SortDirection) => void;
  align?: "left" | "right";
  preferred?: SortDirection;
  /** Shown under the label, for a column whose number needs a word of warning. */
  hint?: string;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active
    ? ChevronsUpDown
    : sort.direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className={cn(TH_CLASS, align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(column, preferred)}
        className={cn(
          "hover:text-foreground focus-visible:ring-ring/50 -mx-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 tracking-[0.12em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {active && (
          <span
            className="bg-marker h-3 w-[3px] shrink-0 rounded-full"
            aria-hidden="true"
          />
        )}
        {label}
        <Icon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
      </button>
      {hint && (
        <span className="text-muted-foreground/80 mt-0.5 block font-sans text-[0.6rem] font-normal tracking-normal normal-case">
          {hint}
        </span>
      )}
    </th>
  );
}
