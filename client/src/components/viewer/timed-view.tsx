"use client";

import { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import { cn } from "@/lib/utils";
import type { Locator } from "@/types/api";

/**
 * FR-5.6 and FR-5.7. A YouTube source seeks the player to the cited second and
 * highlights the matching cue beside it; a VTT source is the transcript alone.
 * Either way the cited range is scrolled into view, because a highlight the user
 * has to hunt for is not a citation.
 */
export function TimedView({
  cues,
  videoId,
  locator,
}: {
  cues: { startSec: number; endSec: number; text: string }[];
  videoId?: string;
  locator: Locator | null;
}) {
  const target = locator?.kind === "timed" ? locator : null;
  const [playerAt, setPlayerAt] = useState<number | null>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const player = useRef<{
    seekTo: (seconds: number, allow: boolean) => void;
  } | null>(null);

  const current = playerAt ?? target?.startSec ?? null;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target, cues.length]);

  useEffect(() => {
    if (target) player.current?.seekTo(target.startSec, true);
  }, [target]);

  function seek(seconds: number) {
    setPlayerAt(seconds);
    player.current?.seekTo(seconds, true);
  }

  return (
    <div className="flex h-full flex-col">
      {videoId && (
        <div className="aspect-video w-full shrink-0 bg-black">
          <YouTube
            videoId={videoId}
            className="h-full w-full"
            iframeClassName="h-full w-full"
            opts={{ playerVars: { start: Math.floor(target?.startSec ?? 0) } }}
            onReady={(event) => {
              player.current = event.target as typeof player.current;
              if (target) player.current?.seekTo(target.startSec, true);
            }}
          />
        </div>
      )}

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {cues.map((cue, index) => {
          const cited =
            target !== null &&
            cue.startSec < target.endSec &&
            cue.endSec > target.startSec;
          const playing =
            current !== null &&
            current >= cue.startSec &&
            current < cue.endSec &&
            !cited;

          return (
            <li
              key={`${cue.startSec}-${index}`}
              ref={cited ? activeRef : undefined}
              className={cn(
                "flex gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                cited && "bg-amber-500/20 ring-1 ring-amber-500/40",
                playing && "bg-accent",
              )}
            >
              <button
                type="button"
                onClick={() => seek(cue.startSec)}
                className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-xs tabular-nums"
                aria-label={`Jump to ${formatTime(cue.startSec)}`}
              >
                {formatTime(cue.startSec)}
              </button>
              <span className="min-w-0 flex-1">{cue.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
