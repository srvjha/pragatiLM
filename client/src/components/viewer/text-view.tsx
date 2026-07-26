"use client";

import { useEffect, useRef } from "react";
import type { Locator } from "@/types/api";

/**
 * FR-5.8. The cited character range is highlighted and scrolled to. The offsets
 * index the same normalised text the extractor chunked, which is why the server
 * normalises again before returning it rather than sending the raw bytes.
 */
export function TextView({
  text,
  locator,
}: {
  text: string;
  locator: Locator | null;
}) {
  const mark = useRef<HTMLElement>(null);
  const range = locator?.kind === "text" ? locator : null;

  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [range]);

  if (!range) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <pre className="font-sans text-sm break-words whitespace-pre-wrap">
          {text}
        </pre>
      </div>
    );
  }

  const start = Math.max(0, Math.min(range.startChar, text.length));
  const end = Math.max(start, Math.min(range.endChar, text.length));

  return (
    <div className="h-full overflow-y-auto p-4">
      <pre className="font-sans text-sm break-words whitespace-pre-wrap">
        {text.slice(0, start)}
        <mark ref={mark} className="bg-amber-500/30 text-inherit">
          {text.slice(start, end)}
        </mark>
        {text.slice(end)}
      </pre>
    </div>
  );
}
