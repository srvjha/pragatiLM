/**
 * How the admin panel prints numbers.
 *
 * One module, because the same figure appears in a tile, a table cell and a
 * tooltip on this page, and three formattings of one number is how a dashboard
 * starts disagreeing with itself.
 *
 * Grouping is Indian throughout, matching the rest of the product: this is a
 * rupee product and 12,34,567 is what its operators read.
 */

const grouped = new Intl.NumberFormat("en-IN");

/** Nothing here may print NaN, or a zero that was really an absence. */
const absent = (value: number | null | undefined): boolean =>
  value === null || value === undefined || Number.isNaN(value);

/** The stand-in for a figure the server did not send. */
export const NONE = "-";

export function count(value: number | null | undefined): string {
  return absent(value) ? NONE : grouped.format(value as number);
}

/** For figures too large to read digit by digit, such as token totals. */
export function compact(value: number | null | undefined): string {
  if (absent(value)) return NONE;
  const number = value as number;
  if (Math.abs(number) >= 1_000_000_000)
    return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(number) >= 1_000_000)
    return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return grouped.format(number);
}

/**
 * Rupees, from a rupee figure rather than paise.
 *
 * Small sums keep two decimals because an AI call can cost a fraction of a
 * rupee and rounding it to zero would say the feature was free. Anything over a
 * hundred rounds, because nobody reconciles paise on a thirty day total.
 */
export function rupees(value: number | null | undefined): string {
  if (absent(value)) return NONE;
  const number = value as number;
  if (number === 0) return "₹0";
  if (Math.abs(number) < 100)
    return `₹${number.toFixed(2).replace(/\.00$/, "")}`;
  return `₹${grouped.format(Math.round(number))}`;
}

/** A rate that arrives as a fraction of one. */
export function percent(value: number | null | undefined, digits = 1): string {
  if (absent(value)) return NONE;
  const number = (value as number) * 100;
  // A rate that is small but not zero must not print as "0%": that is the
  // difference between a healthy service and one quietly failing.
  if (number > 0 && number < 0.1) return "<0.1%";
  return `${number.toFixed(number >= 10 || number === 0 ? 0 : digits)}%`;
}

/** Milliseconds, as an operator reads them. */
export function millis(value: number | null | undefined): string {
  if (absent(value)) return NONE;
  const number = value as number;
  return number >= 10_000
    ? `${(number / 1000).toFixed(1)}s`
    : `${grouped.format(Math.round(number))}ms`;
}

/**
 * A span of minutes said as hours and minutes. This is the proxy figure, so
 * nothing here pretends to a precision the measure does not have: over an hour
 * the minutes are still shown, but the number was never exact to begin with and
 * the column heading says as much.
 */
export function minutes(value: number | null | undefined): string {
  if (absent(value)) return NONE;
  const total = Math.round(value as number);
  if (total <= 0) return "0m";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** "12 Sep" for an axis or a row, from an ISO date or timestamp. */
export function onDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NONE;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "12 Sep 2026", where the year matters. */
export function onDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NONE;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "12 Sep, 14:05", for the audit log, where the hour is the point. */
export function onDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NONE;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Plan codes come out of the database lowercase. A table reading "free" next to
 * "Pro" looks like two different kinds of thing.
 */
export function planName(code: string): string {
  if (!code) return NONE;
  return code.charAt(0).toUpperCase() + code.slice(1);
}
