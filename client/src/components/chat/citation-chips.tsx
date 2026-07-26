"use client";

import { Captions, FileText, FileVideo, Globe, Type } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CitationDto, Locator } from "@/types/api";

/**
 * FR-5.2 and FR-5.3. The strip beneath an answer, with the quoted text on hover
 * so the evidence can be judged without leaving the transcript.
 */
export function CitationChips({
  citations,
  onCite,
}: {
  citations: CitationDto[];
  onCite: (citation: CitationDto) => void;
}) {
  if (citations.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {citations.map((citation) => (
        <Tooltip key={citation.id || citation.markerIndex}>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => onCite(citation)}
                className="bg-muted hover:bg-accent flex max-w-52 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
              >
                <span className="text-muted-foreground">
                  {citation.markerIndex}
                </span>
                <span className="truncate">{describe(citation.locator)}</span>
              </button>
            }
          />
          <TooltipContent className="max-w-sm">
            <p className="line-clamp-6 text-xs leading-relaxed">
              {citation.snippet}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** What the chip says: the position, because that is what clicking it opens. */
function describe(locator: Locator): string {
  switch (locator.kind) {
    case "pdf":
      return `Page ${locator.page}`;
    case "timed":
      return `${formatTime(locator.startSec)} to ${formatTime(locator.endSec)}`;
    case "web":
      return locator.headingPath.at(-1) ?? "Article";
    case "text":
      return "Text";
  }
}

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
