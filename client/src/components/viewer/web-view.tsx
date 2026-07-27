"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Locator } from "@/types/api";

/**
 * FR-5.9. The captured reader view is rendered, not the live site, so what the
 * model read is what the user sees. The cited block is found by walking the same
 * elements the extractor walked, in the same order, so the offsets line up.
 */
export function WebView({
  html,
  locator,
}: {
  html: string;
  locator: Locator | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const range = locator?.kind === "web" ? locator : null;

  // Rendering captured HTML is rendering someone else's markup, so scripts and
  // event handlers are stripped before it reaches the DOM.
  const safe = useMemo(() => sanitise(html), [html]);

  useEffect(() => {
    const root = container.current;
    if (!root || !range) return;

    root.querySelectorAll("[data-cited]").forEach((element) => {
      element.removeAttribute("data-cited");
      element.classList.remove("marked", "marked-active");
    });

    const blocks = root.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre",
    );
    let offset = 0;

    for (const block of blocks) {
      const text = (block.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length === 0) continue;

      const blockEnd = offset + text.length;
      if (offset <= range.startChar && blockEnd >= range.startChar) {
        block.setAttribute("data-cited", "true");
        block.classList.add("marked", "marked-active");
        block.scrollIntoView({ block: "center", behavior: "smooth" });
        break;
      }

      offset = blockEnd + 1;
    }
  }, [safe, range]);

  if (safe.trim().length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
        This page was not captured, so there is nothing to show here.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div
        ref={container}
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </div>
  );
}

function sanitise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
