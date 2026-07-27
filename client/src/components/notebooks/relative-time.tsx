"use client";

import { useSyncExternalStore } from "react";
import { formatDistanceToNow } from "date-fns";

/**
 * A timestamp read as "2 days ago".
 *
 * The relative form cannot be produced during render on the server. It renders
 * against its own clock and the browser hydrates against a different one, so
 * the rows touched most recently, which are the ones at the top of the list,
 * are exactly the ones that disagree: "less than a minute ago" on one side and
 * "1 minute ago" on the other is a hydration mismatch. The first paint is
 * therefore the calendar date, which is derived from the ISO string alone and
 * is identical on both sides, and the relative form takes over once mounted.
 * The `title` is withheld until then for the same reason, since a formatted
 * local date is an attribute mismatch just as a text node is.
 *
 * "Have we hydrated yet" is a fact about the environment rather than state this
 * component owns, so it is read through useSyncExternalStore, which has a
 * server snapshot built in. Setting it from an effect instead would render the
 * date, paint it, and only then correct itself.
 */
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function RelativeTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);

  const date = new Date(iso);
  const valid = !Number.isNaN(date.getTime());

  // A timestamp the server sent malformed should not blank the row or throw.
  if (!valid) return null;

  return (
    <time
      dateTime={iso}
      title={hydrated ? date.toLocaleString() : undefined}
      className={className}
    >
      {hydrated
        ? formatDistanceToNow(date, { addSuffix: true })
        : iso.slice(0, 10)}
    </time>
  );
}
