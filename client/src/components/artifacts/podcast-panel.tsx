"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Loader2, Pause, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import * as api from "@/features/artifacts/api";
import { useSources } from "@/features/sources/hooks";
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api-client";
import { isQueryable } from "@/lib/source-status";
import type { PodcastDto, PodcastTurn } from "@/types/api";

const lengths = [3, 6, 10] as const;

/** FR-7. Episodes with the script beside the player, so what was said is checkable. */
export function PodcastPanel({ notebookId }: { notebookId: string }) {
  const client = useQueryClient();
  const { data: sources } = useSources(notebookId);
  const ready = (sources ?? []).filter(isQueryable);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: episodes, isPending } = useQuery({
    queryKey: queryKeys.podcasts(notebookId),
    queryFn: () => api.fetchPodcasts(notebookId),
    refetchInterval: (query) =>
      query.state.data?.some(
        (row) => row.status === "QUEUED" || row.status === "RUNNING",
      )
        ? 3_000
        : false,
  });

  const create = useMutation({
    mutationFn: (options: {
      minutes: (typeof lengths)[number];
      sourceIds: string[];
      voicePair: string;
    }) =>
      api.createPodcast(
        notebookId,
        options.sourceIds,
        options.minutes,
        options.voicePair,
      ),
    onSuccess: (created) => {
      toast.success("Writing the script...");
      // Opened straight away, because the thing someone wants to watch is the
      // episode they just asked for, not the one they were reading before.
      if (created?.id) setOpenId(created.id);
      void client.invalidateQueries({
        queryKey: queryKeys.podcasts(notebookId),
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not start that episode",
      ),
  });

  if (isPending) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const list = episodes ?? [];
  // The newest unless something else was picked, so the panel opens on the
  // episode most likely to be wanted rather than on nothing.
  const open = list.find((episode) => episode.id === openId) ?? list[0] ?? null;

  return (
    <div className="@container flex h-full flex-col">
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <AudioLines
            className="text-muted-foreground size-8"
            strokeWidth={1.5}
          />
          <div>
            <p className="text-sm font-medium">No episodes yet</p>
            <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-xs leading-relaxed">
              {ready.length === 0
                ? "Add a source and wait for it to finish indexing."
                : "Two hosts talk through what is in this notebook, using nothing else."}
            </p>
          </div>
          <CreateDialog
            disabled={ready.length === 0 || create.isPending}
            notebookId={notebookId}
            sources={ready.map((source) => ({
              id: source.id,
              title: source.title,
            }))}
            onCreate={(options) => create.mutate(options)}
          />
        </div>
      ) : (
        /*
         * One episode open at a time, listed beside rather than beneath.
         *
         * Every episode used to render its own player and its whole transcript
         * into one column, so ten episodes meant ten audio elements each
         * fetching metadata, and the one being listened to was somewhere down a
         * page of transcripts belonging to episodes nobody had asked for.
         *
         * The split is a container query rather than a viewport one, because
         * this panel sits between two resizable columns: what decides whether
         * there is room for a list beside the episode is the width of this
         * panel, not the width of the screen.
         */
        <div className="flex min-h-0 flex-1 flex-col @2xl:flex-row">
          <nav
            aria-label="Episodes"
            className="flex max-h-48 shrink-0 flex-col overflow-hidden border-b @2xl:max-h-none @2xl:w-56 @2xl:border-r @2xl:border-b-0"
          >
            {/* The action belongs to the list it adds to, which is also where
                the notebooks rail keeps its own. */}
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-muted-foreground font-mono text-[0.65rem] tracking-wider uppercase">
                {list.length} {list.length === 1 ? "episode" : "episodes"}
              </span>
              <CreateDialog
                compact
                disabled={ready.length === 0 || create.isPending}
                notebookId={notebookId}
                sources={ready.map((source) => ({
                  id: source.id,
                  title: source.title,
                }))}
                onCreate={(options) => create.mutate(options)}
              />
            </div>

            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              {list.map((episode) => (
                <EpisodeListItem
                  key={episode.id}
                  episode={episode}
                  open={episode.id === open?.id}
                  onOpen={() => setOpenId(episode.id)}
                />
              ))}
            </ul>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {/* A transcript is read, so it gets a measure like anything else
                that is read here. Running the full width of a wide panel put
                ninety characters on a line. */}
            <div className="mx-auto max-w-[40rem]">
              {open && <EpisodeDetail notebookId={notebookId} episode={open} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One line in the list: enough to choose by, and nothing that has to load. */
function EpisodeListItem({
  episode,
  open,
  onOpen,
}: {
  episode: PodcastDto;
  open: boolean;
  onOpen: () => void;
}) {
  const working = episode.status === "QUEUED" || episode.status === "RUNNING";

  return (
    <li className="relative">
      {/* The same mark the notebook rail uses for the notebook you are in. */}
      {open && (
        <span
          aria-hidden
          className="bg-marker absolute inset-y-0 left-0 w-[3px] rounded-l"
        />
      )}

      <button
        type="button"
        onClick={onOpen}
        aria-current={open ? "true" : undefined}
        className={cn(
          "focus-visible:ring-ring w-full cursor-pointer rounded px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
          open ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <span className="flex items-start gap-1.5">
          {working && (
            <Loader2 className="text-muted-foreground mt-0.5 size-3 shrink-0 animate-spin" />
          )}
          {/* Two lines rather than one truncated one: every episode in a
              notebook is about the same material, so they open with the same
              few words and the part that tells them apart was the part being
              cut off. */}
          <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug font-medium">
            {episode.title}
          </span>
        </span>
        <span className="text-muted-foreground mt-1 block font-mono text-[0.65rem] tabular-nums">
          {new Date(episode.createdAt).toLocaleDateString()}
          {episode.durationSec
            ? ` \u00b7 ${formatDuration(episode.durationSec)}`
            : ""}
          {episode.status === "FAILED" ? " \u00b7 failed" : ""}
        </span>
      </button>
    </li>
  );
}

function EpisodeDetail({
  notebookId,
  episode,
}: {
  notebookId: string;
  episode: PodcastDto;
}) {
  const working = episode.status === "QUEUED" || episode.status === "RUNNING";
  const turns = episode.script ?? [];

  return (
    <div>
      <p className="text-[0.95rem] leading-snug font-semibold tracking-tight">
        {episode.title}
      </p>
      <p className="text-muted-foreground mt-1 font-mono text-[0.7rem]">
        {new Date(episode.createdAt).toLocaleDateString()}
        {episode.durationSec
          ? ` \u00b7 ${formatDuration(episode.durationSec)}`
          : ""}
        {turns.length > 0 ? ` \u00b7 ${turns.length} turns` : ""}
      </p>

      {/* FR-7.3: the stage shown is the stage the job is in, not an animation. */}
      {working && (
        <div className="mt-2">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3 animate-spin" />
            {describeStage(episode)}
          </div>
          <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded">
            <div
              className="bg-foreground h-full transition-all"
              style={{ width: `${episode.progress}%` }}
            />
          </div>
        </div>
      )}

      {episode.status === "FAILED" && (
        <p className="text-destructive mt-2 text-xs">
          {episode.errorMessage ?? "This episode failed."}
        </p>
      )}

      {episode.status === "READY" && (
        <Episode
          // Remounts when the open episode changes, so the player never carries
          // the previous episode's position into the next one.
          key={episode.id}
          src={api.podcastAudioUrl(notebookId, episode.id)}
          turns={turns}
          durationSec={episode.durationSec ?? 0}
        />
      )}

      {/* An episode still being made already has its script, and reading it is
          the only thing there is to do while the voices are recorded. */}
      {working && turns.length > 0 && (
        <ol className="mt-5 space-y-3 border-t pt-4">
          {turns.map((turn, index) => (
            <Turn key={index} turn={turn} />
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The player and the transcript, which are one thing rather than two.
 *
 * The transcript is no longer behind a toggle: a spoken conversation you cannot
 * read along with is a black box, and the whole claim of this feature is that
 * what was said is checkable. So it is always there, the line being spoken is
 * marked as it is spoken, and any line can be clicked to hear it.
 */
function Episode({
  src,
  turns,
  durationSec,
}: {
  src: string;
  turns: PodcastTurn[];
  durationSec: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(durationSec);
  const [rate, setRate] = useState(1);

  const { spans, measured } = useTurnSpans(turns, total);
  const current = spans.findIndex((span) => at >= span.start && at < span.end);

  const seek = useCallback((seconds: number) => {
    const element = audio.current;
    if (!element) return;

    element.currentTime = seconds;
    setAt(seconds);
    void element.play().catch(() => undefined);
  }, []);

  function toggle() {
    const element = audio.current;
    if (!element) return;

    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  }

  function changeRate() {
    const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  const elapsed = Math.floor(at);
  const remaining = Math.max(0, Math.floor(total) - elapsed);

  return (
    <div className="mt-4">
      <audio
        ref={audio}
        preload="metadata"
        // The audio lives behind the same session as everything else, but a
        // media element is not a fetch: it sends no cookie cross origin unless
        // asked, so the request arrived unauthenticated, the API answered 401
        // in JSON, and the player reported a format error for what was never
        // audio in the first place.
        crossOrigin="use-credentials"
        src={src}
        onLoadedMetadata={(event) => {
          const found = event.currentTarget.duration;
          if (Number.isFinite(found) && found > 0) setTotal(found);
        }}
        onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />

      <div className="bg-card flex items-center gap-3.5 rounded-lg border p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="bg-foreground text-background focus-visible:ring-ring flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:outline-none"
        >
          {playing ? (
            <Pause className="size-4 fill-current" />
          ) : (
            // Nudged right by a hair: a triangle centred by its bounding box
            // reads as sitting left of centre.
            <Play className="size-4 translate-x-px fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(total, 0.1)}
            step={0.1}
            value={Math.min(at, total)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek"
            className="accent-foreground h-1 w-full cursor-pointer"
          />
          <div className="text-muted-foreground mt-1 flex justify-between font-mono text-[0.65rem] tabular-nums">
            <span>{formatDuration(elapsed)}</span>
            <span>-{formatDuration(remaining)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={changeRate}
          aria-label={`Playback speed, currently ${rate} times`}
          className="text-muted-foreground hover:text-foreground hover:border-foreground/30 focus-visible:ring-ring shrink-0 cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[0.65rem] tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {rate}×
        </button>
      </div>

      <ol className="mt-5 space-y-3 border-t pt-4">
        {turns.map((turn, index) => (
          <Turn
            key={index}
            turn={turn}
            active={index === current}
            startSec={spans[index]?.start ?? 0}
            measured={measured}
            onSeek={seek}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * Where each turn falls in the episode.
 *
 * Synthesis measures every segment and records it, so a recent episode is
 * exact. Anything made before that was recorded has no timings at all, and
 * rather than leave those transcripts dead the spans are apportioned by how
 * much text each turn holds. That is an estimate and drifts, but a transcript
 * that follows roughly is far more use than one that does not move.
 */
function useTurnSpans(turns: PodcastTurn[], total: number) {
  return useMemo(() => {
    const measured =
      turns.length > 0 &&
      turns.every(
        (turn) =>
          typeof turn.startSec === "number" && typeof turn.endSec === "number",
      );

    if (measured) {
      return {
        measured,
        spans: turns.map((turn) => ({
          start: turn.startSec ?? 0,
          end: turn.endSec ?? 0,
        })),
      };
    }

    const characters =
      turns.reduce((sum, turn) => sum + turn.text.length, 0) || 1;
    let elapsed = 0;

    return {
      measured,
      spans: turns.map((turn) => {
        const start = elapsed;
        elapsed += (turn.text.length / characters) * total;
        return { start, end: elapsed };
      }),
    };
  }, [turns, total]);
}

function Turn({
  turn,
  active = false,
  startSec,
  measured = false,
  onSeek,
}: {
  turn: PodcastTurn;
  active?: boolean;
  startSec?: number;
  /** Whether the time shown was measured from the audio or apportioned. */
  measured?: boolean;
  onSeek?: (seconds: number) => void;
}) {
  const row = useRef<HTMLLIElement>(null);

  // Follows the audio, but only when it has to: scrolling on every tick fights
  // anyone reading ahead, and `nearest` leaves the page alone while the line is
  // already on screen.
  useEffect(() => {
    if (active)
      row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const label = turn.host === "A" ? "Host A" : "Host B";
  const seekable = onSeek !== undefined && startSec !== undefined;

  const body = (
    <>
      <span className="w-16 shrink-0">
        <span
          className={cn(
            "block font-sans text-[0.7rem] font-medium",
            // The two hosts need to be told apart, not coloured in. Weight and
            // the chart tokens do it inside the palette; emerald and sky came
            // from outside it.
            turn.host === "A"
              ? "text-[var(--color-chart-1)]"
              : "text-[var(--color-chart-2)]",
          )}
        >
          {label}
        </span>
        {/* A position in the episode is a locator, and every locator in this
            product is set in mono: a page number, a video timestamp, a citation
            marker. Shown only when it was measured from the audio, because an
            apportioned guess printed to the second would be claiming a
            precision it does not have. */}
        {measured && startSec !== undefined && (
          <span className="text-muted-foreground block font-mono text-[0.62rem] tabular-nums">
            {formatDuration(Math.floor(startSec))}
          </span>
        )}
      </span>
      <span
        className={cn(
          "flex-1 font-serif text-[0.82rem] leading-relaxed",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {turn.text}
      </span>
    </>
  );

  return (
    <li
      ref={row}
      // The marker means the product has matched something, and the line being
      // spoken right now is exactly that: the place in the transcript the audio
      // has reached.
      className={cn(
        "flex rounded-r border-l-2 transition-colors",
        active ? "border-marker bg-accent/40" : "border-transparent",
        // A line you can click to hear should say so before it is clicked.
        seekable && !active && "hover:bg-accent/25",
      )}
    >
      {seekable ? (
        <button
          type="button"
          onClick={() => onSeek(startSec)}
          title={`Play from ${formatDuration(Math.floor(startSec))}`}
          className="focus-visible:ring-ring flex flex-1 cursor-pointer gap-3 rounded-r py-1.5 pr-1 pl-3 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-1 gap-3 py-1.5 pr-1 pl-3">{body}</div>
      )}
    </li>
  );
}

function describeStage(episode: PodcastDto): string {
  switch (episode.stage) {
    case "SCRIPTING":
      return "Writing the script...";
    case "SYNTHESIZING":
      return "Recording the voices...";
    case "MIXING":
      return "Stitching the audio...";
    default:
      return "Starting...";
  }
}

function CreateDialog({
  disabled,
  notebookId,
  sources,
  onCreate,
  compact = false,
}: {
  disabled: boolean;
  /**
   * An icon in the list header, where the notebooks rail puts the same control
   * and where a labelled button would take half the column. Spelled out in the
   * empty state, where it is the only thing to do on the screen.
   */
  compact?: boolean;
  notebookId: string;
  /** The ready sources, which are the only ones that can be drawn from. */
  sources: { id: string; title: string }[];
  onCreate: (options: {
    minutes: (typeof lengths)[number];
    sourceIds: string[];
    voicePair: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<(typeof lengths)[number]>(3);
  const [voicePair, setVoicePair] = useState("warm");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // Fetched rather than hardcoded, so the options and the values the API
  // validates are the same list.
  const { data: pairs } = useQuery({
    queryKey: ["voice-pairs", notebookId],
    queryFn: () => api.fetchVoicePairs(notebookId),
    staleTime: Infinity,
  });

  const chosen = sources.filter((source) => !excluded.has(source.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          compact ? (
            <Button
              size="icon"
              variant="ghost"
              disabled={disabled}
              aria-label="New episode"
              title="New episode"
              className="size-7 shrink-0"
            >
              <Plus className="size-4" />
            </Button>
          ) : (
            <Button size="sm" disabled={disabled}>
              New episode
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a podcast</DialogTitle>
          <DialogDescription>
            Two hosts discuss this notebook. The script is written from your
            sources alone and is shown beside the player, so you can check what
            was said.
          </DialogDescription>
        </DialogHeader>

        <Fieldset label="Length">
          <div className="flex gap-2">
            {lengths.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMinutes(option)}
                className={cn(
                  "flex-1 rounded-md border py-2.5 text-sm transition-colors",
                  minutes === option
                    ? "border-primary bg-accent"
                    : "hover:bg-accent/50",
                )}
              >
                {option} min
              </button>
            ))}
          </div>
        </Fieldset>

        <Fieldset label="Voices">
          <div className="flex gap-2">
            {(pairs ?? []).map((pair) => (
              <button
                key={pair.id}
                type="button"
                onClick={() => setVoicePair(pair.id)}
                className={cn(
                  "flex-1 rounded-md border py-2.5 text-sm transition-colors",
                  voicePair === pair.id
                    ? "border-primary bg-accent"
                    : "hover:bg-accent/50",
                )}
              >
                {pair.label}
              </button>
            ))}
          </div>
        </Fieldset>

        <Fieldset label={`Sources (${chosen.length} of ${sources.length})`}>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {sources.map((source) => (
              <label
                key={source.id}
                className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm"
              >
                <Checkbox
                  checked={!excluded.has(source.id)}
                  onCheckedChange={(checked) =>
                    setExcluded((previous) => {
                      const next = new Set(previous);
                      if (checked === true) next.delete(source.id);
                      else next.add(source.id);
                      return next;
                    })
                  }
                />
                <span className="truncate">{source.title}</span>
              </label>
            ))}
          </div>
        </Fieldset>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              onCreate({
                minutes,
                // Every source selected is sent as an empty list, which the API
                // reads as "all of them" and keeps working if one is added
                // between opening this dialog and the job running.
                sourceIds:
                  chosen.length === sources.length
                    ? []
                    : chosen.map((s) => s.id),
                voicePair,
              });
              setOpen(false);
            }}
          >
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fieldset({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      {children}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
