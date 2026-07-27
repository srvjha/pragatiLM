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

  // Source text is material, so it is set in the reading face at a comfortable
  // measure rather than in the interface grotesque edge to edge.
  const body =
    "mx-auto max-w-prose font-serif text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap";

  if (!range) {
    return (
      <div className="h-full overflow-y-auto px-5 py-4">
        <pre className={body}>{text}</pre>
      </div>
    );
  }

  const start = Math.max(0, Math.min(range.startChar, text.length));
  const end = Math.max(start, Math.min(range.endChar, text.length));

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <pre className={body}>
        {text.slice(0, start)}
        {/* The same `marked` gesture the PDF and the transcript use. It was an
            amber tint from outside the palette, which meant the one visual
            idea the product is built on read differently in each viewer. */}
        <mark ref={mark} className="marked marked-active">
          {text.slice(start, end)}
        </mark>
        {text.slice(end)}
      </pre>
    </div>
  );
}
