"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import YouTube, { type YouTubePlayer } from "react-youtube";
import { ArrowDownToLine, Languages, Loader2, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchCaptions,
  type Cue,
  type CaptionTrack,
} from "@/features/sources/content-api";
import { cn } from "@/lib/utils";
import type { Locator } from "@/types/api";

/**
 * FR-5.6 and FR-5.7, and the reason this file is not a list of strings.
 *
 * A video transcript is not a document that happens to have timestamps: it is
 * a second view onto something you are watching. So the two are shown together
 * and kept in step. The player scrolls the transcript as it plays, a line
 * clicked seeks the player to it, and a citation lands on both at once.
 *
 * Reading and watching pull in opposite directions, which is the one piece of
 * behaviour here worth stating plainly: following the playhead is right until
 * the reader scrolls somewhere themselves, at which point yanking them back
 * every few seconds makes the transcript unusable. Following therefore stops
 * the moment they take the scrollbar and resumes only when they ask.
 */

/** How often the playhead is read. Four times a second is under a cue. */
const POLL_MS = 250;

type Player = Pick<
  YouTubePlayer,
  "seekTo" | "playVideo" | "pauseVideo" | "getCurrentTime" | "getDuration"
>;

export function TimedView({
  notebookId,
  sourceId,
  cues: indexedCues,
  paragraphs,
  videoId,
  durationSec,
  tracks,
  track,
  locator,
}: {
  notebookId: string;
  sourceId: string;
  cues: Cue[];
  paragraphs?: string[];
  videoId?: string;
  durationSec?: number;
  tracks?: CaptionTrack[];
  track?: string | null;
  locator: Locator | null;
}) {
  const target = locator?.kind === "timed" ? locator : null;
  const indexedTrack = track ?? null;

  const [selected, setSelected] = useState<string | null>(indexedTrack);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);

  const player = useRef<Player | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The indexed track is already loaded; any other is fetched on demand and
  // cached by the server, so switching back and forth costs one request each.
  const isIndexed = selected === null || selected === indexedTrack;

  const captions = useQuery({
    queryKey: ["captions", sourceId, selected],
    queryFn: () => fetchCaptions(notebookId, sourceId, selected ?? ""),
    enabled: !isIndexed,
    staleTime: Infinity,
  });

  const cues = isIndexed ? indexedCues : (captions.data?.cues ?? indexedCues);

  /**
   * Which line the playhead is inside.
   *
   * Recomputed on every tick but only written to state when it changes, so a
   * transcript of a thousand lines re-renders once per line rather than four
   * times a second.
   */
  const activeIndex = useMemo(() => {
    if (!playing && elapsed === 0) return -1;
    return cues.findIndex(
      (cue) => elapsed >= cue.startSec && elapsed < cue.endSec,
    );
  }, [cues, elapsed, playing]);

  const citedIndex = useMemo(() => {
    if (!target) return -1;
    return cues.findIndex(
      (cue) => cue.startSec < target.endSec && cue.endSec > target.startSec,
    );
  }, [cues, target]);

  // The video's own length when it is known, because captions usually stop
  // before the end and a bar that fills early looks broken.
  const duration = durationSec ?? cues[cues.length - 1]?.endSec ?? 0;

  useEffect(() => {
    if (!playing) return;

    const timer = setInterval(() => {
      const at = player.current?.getCurrentTime?.();
      if (typeof at === "number") setElapsed(at);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [playing]);

  // A citation is an instruction to go somewhere, so it overrides following:
  // it moves the playhead and scrolls the transcript whatever the reader was
  // doing before, because they asked for this by clicking the citation.
  //
  // Adjusted during render rather than in an effect. This is state derived
  // from a prop change, so an effect would render once with the old position,
  // paint it, and only then correct itself.
  const [seenTarget, setSeenTarget] = useState(target);
  if (target !== seenTarget) {
    setSeenTarget(target);
    if (target) {
      setFollow(true);
      setElapsed(target.startSec);
    }
  }

  // The player is an external system, so moving it stays in an effect.
  useEffect(() => {
    if (target) player.current?.seekTo(target.startSec, true);
  }, [target]);

  useEffect(() => {
    const index = citedIndex >= 0 ? citedIndex : follow ? activeIndex : -1;
    if (index < 0) return;

    listRef.current
      ?.querySelector(`[data-cue="${index}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [citedIndex, activeIndex, follow]);

  const seek = useCallback((seconds: number) => {
    setElapsed(seconds);
    setFollow(true);
    player.current?.seekTo(seconds, true);
    player.current?.playVideo?.();
  }, []);

  /**
   * Only a deliberate scroll turns following off, which is why this listens for
   * the wheel and for a finger rather than for the scroll event. Scrolling is
   * also what *this* component does to follow along, so a scroll listener would
   * switch following off the first time it followed anything.
   */
  function release() {
    setFollow(false);
  }

  const empty = cues.length === 0 && (paragraphs?.length ?? 0) === 0;

  return (
    <div className="flex h-full flex-col">
      {videoId && (
        <div className="bg-foreground shrink-0">
          <div className="aspect-video w-full">
            <YouTube
              videoId={videoId}
              className="h-full w-full"
              iframeClassName="h-full w-full"
              opts={{
                playerVars: {
                  start: Math.floor(target?.startSec ?? 0),
                  rel: 0,
                  modestbranding: 1,
                },
              }}
              onReady={(event) => {
                player.current = event.target;
                if (target) event.target.seekTo(target.startSec, true);
              }}
              onStateChange={(event) => {
                // 1 is playing, 3 is buffering. Both mean the playhead is live.
                setPlaying(event.data === 1);
                const at = event.target.getCurrentTime?.();
                if (typeof at === "number") setElapsed(at);
              }}
            />
          </div>

          {duration > 0 && (
            <div
              className="bg-background/20 h-0.5 w-full origin-left"
              aria-hidden
            >
              <div
                className="bg-primary h-full origin-left transition-transform duration-200 ease-linear"
                style={{
                  transform: `scaleX(${Math.min(elapsed / duration, 1)})`,
                }}
              />
            </div>
          )}
        </div>
      )}

      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
        <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
          Transcript
        </h3>

        {duration > 0 && (
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            {formatTime(elapsed)} <span className="opacity-40">/</span>{" "}
            {formatTime(duration)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {captions.isFetching && (
            <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
          )}

          {tracks && tracks.length > 1 && (
            <LanguageSwitch
              tracks={tracks}
              selected={selected ?? indexedTrack ?? tracks[0]?.code ?? ""}
              disabled={captions.isFetching}
              onSelect={setSelected}
            />
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onWheel={release}
          onTouchMove={release}
          className="h-full overflow-y-auto px-2 py-2"
        >
          {captions.isError && (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              {captions.error instanceof Error
                ? captions.error.message
                : "That transcript language could not be loaded."}
            </p>
          )}

          {empty && !captions.isFetching && (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              No transcript was captured for this video.
            </p>
          )}

          {cues.length > 0 && (
            <ol
              className={cn("space-y-px", captions.isFetching && "opacity-50")}
            >
              {cues.map((cue, index) => (
                <TranscriptLine
                  key={`${cue.startSec}-${index}`}
                  index={index}
                  cue={cue}
                  cited={index === citedIndex}
                  active={index === activeIndex}
                  onSeek={seek}
                />
              ))}
            </ol>
          )}

          {/* No timings, so nothing to click and nothing to follow. The text is
              still the transcript of the video playing above it. */}
          {cues.length === 0 && paragraphs && paragraphs.length > 0 && (
            <div className="space-y-3 px-2 py-1">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="font-serif text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          )}
        </div>

        {!follow && playing && cues.length > 0 && (
          <button
            type="button"
            onClick={() => setFollow(true)}
            className={cn(
              "bg-foreground text-background absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5",
              "rounded-full px-3 py-1.5 text-xs font-medium shadow-lg",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
              "transition-transform hover:scale-[1.03] active:scale-95",
            )}
          >
            <ArrowDownToLine className="size-3.5" />
            Follow the video
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Memoised, because the parent re-renders on every tick of the playhead and a
 * long transcript is a thousand of these. Only the two lines whose state
 * actually changed do any work.
 */
const TranscriptLine = memo(function TranscriptLine({
  index,
  cue,
  cited,
  active,
  onSeek,
}: {
  index: number;
  cue: Cue;
  cited: boolean;
  active: boolean;
  onSeek: (seconds: number) => void;
}) {
  return (
    <li data-cue={index}>
      <button
        type="button"
        onClick={() => onSeek(cue.startSec)}
        className={cn(
          "group relative flex w-full gap-2.5 rounded px-2 py-1.5 text-left transition-colors",
          "hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          // Marker means the product matched something, and a citation is the
          // only thing here that did.
          cited && "bg-marker/45 hover:bg-marker/55",
          active && !cited && "bg-primary/5",
        )}
        aria-current={active ? "true" : undefined}
        aria-label={`Play from ${formatTime(cue.startSec)}`}
      >
        <span
          aria-hidden
          className={cn(
            "bg-primary absolute top-1 bottom-1 left-0 w-0.5 origin-center rounded-full",
            "transition-transform duration-200",
            active && !cited ? "scale-y-100" : "scale-y-0",
          )}
        />

        <span
          className={cn(
            "text-muted-foreground group-hover:text-foreground shrink-0 pt-px font-mono text-[11px] tabular-nums transition-colors",
            (active || cited) && "text-foreground",
          )}
        >
          {formatTime(cue.startSec)}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 font-serif text-sm leading-relaxed",
            active && !cited && "font-medium",
          )}
        >
          {cue.text}
        </span>
      </button>
    </li>
  );
});

/**
 * The language control.
 *
 * A translated track is labelled as one rather than presented as if the
 * speaker had said it in English, because a reader quoting a sentence back
 * deserves to know a model wrote it. Hinglish needs no such mark: it is the
 * same words in a different script.
 */
function LanguageSwitch({
  tracks,
  selected,
  disabled,
  onSelect,
}: {
  tracks: CaptionTrack[];
  selected: string;
  disabled: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Transcript language"
      className="bg-muted flex items-center gap-0.5 rounded-md p-0.5"
    >
      <Languages
        className="text-muted-foreground ml-1 size-3.5 shrink-0"
        aria-hidden
      />

      {tracks.map((track) => {
        const isSelected = track.code === selected;

        const button = (
          <button
            key={track.code}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(track.code)}
            aria-pressed={isSelected}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
              "transition-[background-color,color,transform] duration-150",
              "disabled:pointer-events-none disabled:opacity-60",
              isSelected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground active:scale-95",
            )}
          >
            {track.label}
            {track.kind === "translated" && (
              <Sparkles className="size-3 opacity-70" aria-hidden />
            )}
          </button>
        );

        if (track.kind === "native") return button;

        return (
          <Tooltip key={track.code}>
            <TooltipTrigger render={button} />
            <TooltipContent>
              {track.kind === "translated"
                ? "Translated by a model from the video's own captions"
                : "The Hindi captions written in Latin script. Same words, same timings."}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);

  if (minutes < 60) return `${minutes}:${String(total % 60).padStart(2, "0")}`;

  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
