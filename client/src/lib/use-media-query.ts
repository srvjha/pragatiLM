"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads a media query without an effect, so there is no flash of the wrong
 * layout on the first paint and no state written during render.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    // The server has no viewport. False keeps the overlay layout, which works at
    // every width, so hydration cannot mismatch into a broken split.
    () => false,
  );
}
