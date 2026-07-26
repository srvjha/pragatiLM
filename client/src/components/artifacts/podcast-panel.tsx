"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
    mutationFn: (lengthMinutes: (typeof lengths)[number]) =>
      api.createPodcast(
        notebookId,
        ready.map((source) => source.id),
        lengthMinutes,
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
          onCreate={(minutes) => create.mutate(minutes)}
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
  onCreate,
}: {
  disabled: boolean;
  onCreate: (minutes: (typeof lengths)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<(typeof lengths)[number]>(3);

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

        <div className="flex gap-2">
          {lengths.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMinutes(option)}
              className={cn(
                "flex-1 rounded-lg border py-3 text-sm transition-colors",
                minutes === option
                  ? "border-foreground/40 bg-accent"
                  : "hover:bg-accent/50",
              )}
            >
              {option} min
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onCreate(minutes);
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

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
