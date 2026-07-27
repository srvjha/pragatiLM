"use client";

import { NotebookRail } from "@/components/notebooks/notebook-rail";

/**
 * The left rail lists notebooks, and only notebooks.
 *
 * It used to swap to the open notebook's sources, which put the sources on the
 * left and the source viewer on the right: the same material in two places,
 * competing for attention. Sources now live in the right column beside the
 * viewer they open into, so this rail has one job and keeps it.
 *
 * The rail owns its own surface rather than inheriting the page's. The palette
 * carries a dedicated sidebar ground for exactly this: a shade off the paper,
 * enough that the navigation reads as a different plane from the material
 * without a heavy divider doing the work.
 */
export function Rail() {
  return (
    <div className="bg-sidebar text-sidebar-foreground h-full">
      <NotebookRail />
    </div>
  );
}
