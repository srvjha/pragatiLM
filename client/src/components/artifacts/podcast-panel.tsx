"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Loader2 } from "lucide-react";
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
import type { PodcastDto } from "@/types/api";

const lengths = [3, 6, 10] as const;

/** FR-7. Episodes with the script beside the player, so what was said is checkable. */
export function PodcastPanel({ notebookId }: { notebookId: string }) {
  const client = useQueryClient();
  const { data: sources } = useSources(notebookId);
  const ready = (sources ?? []).filter(isQueryable);

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
    onSuccess: () => {
      toast.success("Writing the script...");
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

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Podcast</h2>
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

      {(episodes ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AudioLines
            className="text-muted-foreground size-8"
            strokeWidth={1.5}
          />
          <div>
            <p className="text-sm font-medium">No episodes yet</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-xs">
              {ready.length === 0
                ? "Add a source and wait for it to finish indexing."
                : "Two hosts talk through what is in this notebook, using nothing else."}
            </p>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {(episodes ?? []).map((episode) => (
          <EpisodeRow
            key={episode.id}
            notebookId={notebookId}
            episode={episode}
          />
        ))}
      </ul>
    </div>
  );
}

function EpisodeRow({
  notebookId,
  episode,
}: {
  notebookId: string;
  episode: PodcastDto;
}) {
  const [showScript, setShowScript] = useState(false);
  const working = episode.status === "QUEUED" || episode.status === "RUNNING";

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{episode.title}</p>
          <p className="text-muted-foreground text-xs">
            {new Date(episode.createdAt).toLocaleDateString()}
            {episode.durationSec
              ? ` · ${formatDuration(episode.durationSec)}`
              : ""}
          </p>
        </div>

        {episode.script && episode.script.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowScript((open) => !open)}
          >
            {showScript ? "Hide script" : "Script"}
          </Button>
        )}
      </div>

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
        <audio
          controls
          preload="none"
          className="mt-2 w-full"
          src={api.podcastAudioUrl(notebookId, episode.id)}
        >
          Your browser cannot play audio.
        </audio>
      )}

      {showScript && episode.script && (
        <ol className="mt-3 space-y-2 border-t pt-3">
          {episode.script.map((turn, index) => (
            <li key={index} className="flex gap-2 text-xs">
              <span
                className={cn(
                  "shrink-0 font-medium",
                  turn.host === "A" ? "text-emerald-600" : "text-sky-600",
                )}
              >
                {turn.host === "A" ? "Host A" : "Host B"}
              </span>
              <span className="text-muted-foreground flex-1 leading-relaxed">
                {turn.text}
              </span>
            </li>
          ))}
        </ol>
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
}: {
  disabled: boolean;
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
          <Button size="sm" disabled={disabled}>
            New episode
          </Button>
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
