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
 * Grouped by source, which matters more than it sounds. An answer drawn from
 * one video produced eight chips reading "YouTube video 6aF7z..." with a
 * different timestamp on each: the source name, the longest thing on every
 * chip, was the one part that carried no information at all, and it was
 * repeated eight times while the titles truncated each other into
 * indistinguishability. The name is now written once and the positions sit
 * under it, which is also the honest shape of the fact being reported — this
 * answer came from one source, in eight places.
 *
 * Three things still make it obvious these open something, because a row of
 * grey pills does not: the strip is labelled, each group carries the icon of
 * its source type, and the tooltip shows the quoted text so the evidence can
 * be judged without leaving the transcript.
 */

/** Beyond this the strip is taller than most answers, so the rest folds away. */
const VISIBLE_SOURCES = 3;

type Group = {
  sourceId: string | null;
  title: string;
  type: string;
  citations: CitationDto[];
};

function groupBySource(citations: CitationDto[]): Group[] {
  const groups = new Map<string, Group>();

  for (const citation of citations) {
    // Falling back to the title keeps citations from a since-deleted source
    // together rather than scattering them into one group each.
    const key = citation.sourceId ?? citation.sourceTitle;
    const existing = groups.get(key);

    if (existing) {
      existing.citations.push(citation);
      continue;
    }

    groups.set(key, {
      sourceId: citation.sourceId,
      title: citation.sourceTitle,
      type: citation.sourceType,
      citations: [citation],
    });
  }

  // Ordered by first appearance in the answer, so the strip reads in the same
  // order as the markers above it.
  return [...groups.values()].map((group) => ({
    ...group,
    citations: [...group.citations].sort(
      (a, b) => a.markerIndex - b.markerIndex,
    ),
  }));
}

export function CitationChips({
  citations,
  onCite,
}: {
  citations: CitationDto[];
  onCite: (citation: CitationDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (citations.length === 0) return null;

  const groups = groupBySource(citations);
  const hidden = Math.max(0, groups.length - VISIBLE_SOURCES);
  const shown = expanded ? groups : groups.slice(0, VISIBLE_SOURCES);

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-muted-foreground mb-2 font-mono text-[0.65rem] tracking-wider uppercase">
        {groups.length === 1
          ? "Source · click a position to open it"
          : `${groups.length} sources · click a position to open`}
      </p>

      <div className="space-y-2">
        {shown.map((group) => (
          <SourceGroup
            key={group.sourceId ?? group.title}
            group={group}
            onCite={onCite}
          />
        ))}
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

function SourceGroup({
  group,
  onCite,
}: {
  group: Group;
  onCite: (citation: CitationDto) => void;
}) {
  const Icon = sourceIcon[group.type as keyof typeof sourceIcon] ?? FileText;

  return (
    <div className="bg-card rounded-md border px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Icon
          className="text-muted-foreground size-3.5 shrink-0"
          strokeWidth={1.75}
        />
        {/* Written once, and in full where it fits. Eight truncated copies of
            the same name told the reader nothing eight times over. */}
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium"
          title={group.title}
        >
          {group.title}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-[0.65rem] tabular-nums">
          {group.citations.length}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {group.citations.map((citation) => (
          <Tooltip key={citation.id || citation.markerIndex}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => onCite(citation)}
                  className="group hover:border-foreground/30 hover:bg-accent focus-visible:ring-ring flex cursor-pointer items-center gap-1.5 rounded border px-1.5 py-1 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px] font-medium">
                    {citation.markerIndex}
                  </span>
                  <span className="font-mono text-[0.68rem] tabular-nums">
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
                Click to open {describe(citation.locator).toLowerCase()} in the
                source.
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
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
