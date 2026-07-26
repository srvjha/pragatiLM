"use client";

import { Loader2, Search, Sparkles, Telescope } from "lucide-react";
import type { StreamPhase } from "@/features/chat/use-chat-stream";

/**
 * FR-4.2 and FR-3.33. The pipeline says what it is doing, and a correction round
 * reads as progress with a reason rather than as a stall.
 */
export function PhaseIndicator({ phase }: { phase: StreamPhase }) {
  if (phase.kind === "idle" || phase.kind === "generating") return null;

  const { icon: Icon, text } = describe(phase);

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <Icon className="size-3.5 animate-pulse" />
      <span>{text}</span>
    </div>
  );
}

function describe(phase: StreamPhase): { icon: typeof Search; text: string } {
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
            ? `Widening the search: ${phase.keywords.slice(0, 3).join(", ")}`
            : "Widening the search...",
      };
    default:
      return { icon: Loader2, text: "Working..." };
  }
}
