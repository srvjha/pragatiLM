"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The rendered width of an element, for charts that draw in real pixels.
 *
 * An SVG could be scaled by a viewBox instead, but scaling scales the ink with
 * it: a 2px line becomes 2.4px on a wide screen and a hairline gridline lands
 * off the pixel grid and blurs. Measuring and drawing at the true size keeps
 * every stroke the width it was specified as, and keeps hit targets honest.
 *
 * Zero until measured. Callers render nothing rather than a chart one pixel
 * wide, which is also what the server sees, so the first paint has no plot in
 * it and nothing mismatches on hydration.
 */
export function useElementWidth<T extends HTMLElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });

    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));

    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
