"use client";

import { NotebookRail } from "@/components/notebooks/notebook-rail";

/**
 * The left rail lists notebooks, and only notebooks.
 *
 * It used to swap to the open notebook's sources, which put the sources on the
 * left and the source viewer on the right: the same material in two places,
 * competing for attention. Sources now live in the right column beside the
 * viewer they open into, so this rail has one job and keeps it.
 */
export function Rail() {
  return <NotebookRail />;
}
