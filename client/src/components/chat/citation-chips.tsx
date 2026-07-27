"use client";

import { useState } from "react";
import {
  Captions,
  ChevronDown,
  FileText,
  FileVideo,
  Globe,
  PanelRight,
  Type,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CitationDto, Locator } from "@/types/api";

/**
 * FR-5.2 and FR-5.3. The strip beneath an answer.
 *
 * Three sources are shown and the rest fold away. An answer can cite eight or
 * more places, and a strip that tall competes with the answer it belongs to:
 * the first few are what anyone actually checks, and the rest should be
 * available without being in the way.
 *
 * Three things make it obvious these open something, because a row of grey
 * pills does not: the strip is labelled, each chip carries the icon of the
 * source type it opens, and a panel icon appears on hover. The tooltip shows
 * the quoted text so the evidence can be judged without leaving the
 * transcript, and says what a click does.
 */

/** How many are visible before the fold. */
const VISIBLE = 3;

export function CitationChips({
  citations,
  onCite,
}: {
  citations: CitationDto[];
  onCite: (citation: CitationDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (citations.length === 0) return null;

  const hidden = Math.max(0, citations.length - VISIBLE);
  const shown = expanded ? citations : citations.slice(0, VISIBLE);

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-muted-foreground mb-2 font-mono text-[0.65rem] tracking-wider uppercase">
        Sources · click to open
      </p>

      <div className="flex flex-wrap gap-1.5">
        {shown.map((citation) => {
          const Icon =
            sourceIcon[citation.sourceType as keyof typeof sourceIcon] ??
            FileText;

          return (
            <Tooltip key={citation.id || citation.markerIndex}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => onCite(citation)}
                    className="group bg-card hover:border-foreground/30 hover:bg-accent focus-visible:ring-ring flex max-w-64 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="text-muted-foreground shrink-0 font-mono text-[10px] font-medium">
                      {citation.markerIndex}
                    </span>
                    <Icon
                      className="text-muted-foreground size-3.5 shrink-0"
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {citation.sourceTitle}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
                      {describe(citation.locator)}
                    </span>
                    <PanelRight className="text-muted-foreground size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                }
              />
              <TooltipContent className="max-w-sm">
                <p className="line-clamp-6 font-serif text-xs leading-relaxed">
                  {citation.snippet}
                </p>
                <p className="text-muted-foreground mt-2 text-[11px]">
                  Click to open {describe(citation.locator).toLowerCase()} in
                  the source.
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-2 inline-flex items-center gap-1 rounded text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
          {expanded
            ? "Show fewer sources"
            : `Show ${hidden} more ${hidden === 1 ? "source" : "sources"}`}
        </button>
      )}
    </div>
  );
}

/** What the chip says: the position, because that is what clicking it opens. */
function describe(locator: Locator): string {
  switch (locator.kind) {
    case "pdf":
      return `Page ${locator.page}`;
    case "timed":
      return `${formatTime(locator.startSec)}–${formatTime(locator.endSec)}`;
    case "web":
      return locator.headingPath.at(-1) ?? "Article";
    case "text":
      return "Text";
  }
}

/** The same wording, reused by the inline markers in the answer body. */
export const describeLocator = describe;

function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const sourceIcon = {
  PDF: FileText,
  TEXT: Type,
  WEB: Globe,
  YOUTUBE: FileVideo,
  VTT: Captions,
};
