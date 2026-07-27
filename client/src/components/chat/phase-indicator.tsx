"use client";

import { Loader2, Search, Sparkles, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamPhase } from "@/features/chat/use-chat-stream";

/**
 * FR-4.2 and FR-3.33. The pipeline says what it is doing, and a correction
 * round reads as progress with a reason rather than as a stall.
 *
 * This is the only window anyone gets into the part of the product that makes
 * it different, so a correction round is given weight the other phases are
 * not: it is the moment the system decided what it had found was not good
 * enough and went back out. Presented as one more grey line, the single most
 * interesting thing this software does would scroll past unnoticed.
 */
export function PhaseIndicator({ phase }: { phase: StreamPhase }) {
  if (phase.kind === "idle" || phase.kind === "generating") return null;

  const { icon: Icon, text, keywords } = describe(phase);
  const correcting = phase.kind === "correcting";

  return (
    <div
      // Announced, because for a screen reader the alternative to this is
      // silence until the whole answer lands.
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 text-xs",
        // Weight from a box and full-strength text rather than from a colour.
        // The marker was tempting here and would have been wrong: a correction
        // round is the system saying it has *not* matched enough yet, which is
        // the opposite of what yellow means everywhere else in this product.
        correcting
          ? "border-border bg-muted text-foreground rounded-md border px-2.5 py-2"
          : "text-muted-foreground",
      )}
    >
      <Icon
        className={cn(
          "mt-px size-3.5 shrink-0",
          // A spinner spins; a magnifying glass rotating on its own axis reads
          // as broken rather than busy, so everything else breathes instead.
          phase.kind === "searching" ||
            phase.kind === "translated" ||
            phase.kind === "routing" ||
            phase.kind === "grading" ||
            phase.kind === "correcting"
            ? "motion-safe:animate-pulse"
            : "motion-safe:animate-spin",
        )}
      />

      <span className="min-w-0 flex-1">
        {text}
        {keywords && keywords.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="border-border bg-background/60 rounded border px-1.5 py-px font-mono text-[0.65rem]"
              >
                {keyword}
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

type Described = {
  icon: typeof Search;
  text: string;
  /** Rendered as chips rather than a comma list, so they read as search terms. */
  keywords?: string[];
};

function describe(phase: StreamPhase): Described {
  switch (phase.kind) {
    case "searching":
      return {
        icon: Search,
        text: `Searching ${phase.sourceCount} ${phase.sourceCount === 1 ? "source" : "sources"}...`,
      };
    case "translated":
      return {
        icon: Sparkles,
        text: "Rephrasing the question to search better...",
      };
    case "routing":
      return {
        icon: Search,
        text: `Searching by ${phase.channels.join(" and ").toLowerCase()}...`,
      };
    case "grading":
      return {
        icon: Telescope,
        text: "Checking whether that is enough to answer...",
      };
    case "correcting":
      return {
        icon: Telescope,
        text:
          phase.keywords.length > 0
            ? "That was not enough, so the search is widening to:"
            : "That was not enough, so the search is widening...",
        keywords: phase.keywords.slice(0, 4),
      };
    default:
      return { icon: Loader2, text: "Working..." };
  }
}
