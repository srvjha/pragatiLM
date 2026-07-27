"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Map, Pin, Plus, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AddSourceDialog } from "@/components/sources/add-source-dialog";
import { useSources } from "@/features/sources/hooks";
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
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api-client";
import { useUiStore } from "@/stores/ui-store";
import type { RoadmapLevel as Level, RoadmapModule } from "@/types/api";

const levels: { value: Level; label: string; hint: string }[] = [
  {
    value: "new",
    label: "New to this",
    hint: "Smaller steps, nothing skipped",
  },
  {
    value: "some",
    label: "Some background",
    hint: "Basics grouped and skippable",
  },
  {
    value: "experienced",
    label: "Experienced",
    hint: "Only what is specific here",
  },
];

/** FR-6. A vertical stepper whose pins open the video at the timestamp. */
export function RoadmapPanel({ notebookId }: { notebookId: string }) {
  const client = useQueryClient();
  const setViewerCitation = useUiStore((state) => state.setViewerCitation);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.roadmap(notebookId),
    queryFn: () => api.fetchRoadmap(notebookId),
    // A generating roadmap settles into READY or FAILED, so polling stops itself.
    refetchInterval: (query) =>
      query.state.data?.roadmap?.status === "QUEUED" ||
      query.state.data?.roadmap?.status === "RUNNING"
        ? 3_000
        : false,
  });

  const generate = useMutation({
    mutationFn: ({
      level,
      goal,
      sourceIds,
    }: {
      level: Level;
      goal?: string;
      sourceIds: string[];
    }) => api.generateRoadmap(notebookId, level, goal, sourceIds),
    onSuccess: () => {
      toast.success("Building your roadmap...");
      void client.invalidateQueries({
        queryKey: queryKeys.roadmap(notebookId),
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not generate a roadmap",
      ),
  });

  if (isPending) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const roadmap = data?.roadmap;
  const canGenerate = data?.canGenerate ?? false;

  if (!roadmap) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Map className="text-muted-foreground size-8" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium">No roadmap yet</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-xs">
            {canGenerate
              ? "Build an ordered path through your recordings, with every step pinned to where it is actually taught."
              : "Add a video or a transcript first. Pins are timestamps, so written sources cannot support one."}
          </p>
        </div>
        <GenerateDialog
          notebookId={notebookId}
          disabled={!canGenerate}
          pending={generate.isPending}
          onGenerate={(level, goal, sourceIds) =>
            generate.mutate({ level, goal, sourceIds })
          }
        />
      </div>
    );
  }

  if (roadmap.status === "QUEUED" || roadmap.status === "RUNNING") {
    return (
      <Generating stage={roadmap.statusStage} progress={roadmap.progress} />
    );
  }

  if (roadmap.status === "FAILED") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-destructive text-sm">
          {roadmap.errorMessage ?? "Generation failed."}
        </p>
        <GenerateDialog
          notebookId={notebookId}
          disabled={!canGenerate}
          pending={generate.isPending}
          onGenerate={(level, goal, sourceIds) =>
            generate.mutate({ level, goal, sourceIds })
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Learning roadmap</h2>
        <GenerateDialog
          notebookId={notebookId}
          disabled={!canGenerate}
          pending={generate.isPending}
          label="Regenerate"
          onGenerate={(level, goal, sourceIds) =>
            generate.mutate({ level, goal, sourceIds })
          }
        />
      </div>

      <ol className="space-y-4">
        {roadmap.modules.map((module, index) => (
          <ModuleStep
            key={`${module.concept}-${index}`}
            module={module}
            index={index}
            onPin={(pin) =>
              setViewerCitation({
                sourceId: pin.sourceId,
                locator: {
                  kind: "timed",
                  startSec: pin.startSec,
                  endSec: pin.endSec,
                },
              })
            }
          />
        ))}
      </ol>
    </div>
  );
}

function ModuleStep({
  module,
  index,
  onPin,
}: {
  module: RoadmapModule;
  index: number;
  onPin: (pin: { sourceId: string; startSec: number; endSec: number }) => void;
}) {
  return (
    <li className="relative border-l pl-6">
      <span className="bg-background absolute -left-[9px] top-1 flex size-4 items-center justify-center rounded-full border">
        {module.skippable ? (
          <CircleCheck className="text-muted-foreground size-3" />
        ) : (
          <span className="bg-foreground size-1.5 rounded-full" />
        )}
      </span>

      <div className="flex items-baseline gap-2">
        <h3
          className={cn(
            "text-sm font-medium",
            module.skippable && "text-muted-foreground",
          )}
        >
          {index + 1}. {module.concept}
        </h3>
        <span className="text-muted-foreground text-xs">
          {module.estimatedMinutes} min
        </span>
        {module.skippable && (
          <span className="text-muted-foreground text-[10px] uppercase">
            skippable
          </span>
        )}
      </div>

      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {module.rationale}
      </p>

      {module.prerequisites.length > 0 && (
        <p className="text-muted-foreground mt-1 text-[11px]">
          After: {module.prerequisites.join(", ")}
        </p>
      )}

      {/* FR-6.5: every pin opens the video at that second. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {module.pins.map((pin, pinIndex) => (
          <button
            key={`${pin.sourceId}-${pinIndex}`}
            type="button"
            onClick={() => onPin(pin)}
            className="bg-muted hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors"
          >
            <Pin className="size-3" />
            {formatTime(pin.startSec)}
          </button>
        ))}
      </div>
    </li>
  );
}

/**
 * What it is doing, and roughly how far in.
 *
 * Generation is one long model call, so the bar reports the stage rather than
 * a measured fraction and the stage says which one. That is the honest version
 * of the question someone staring at a spinner is actually asking, which is
 * whether anything is happening at all.
 */
function Generating({
  stage,
  progress,
}: {
  stage: string | null;
  progress: number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <RotateCw className="text-muted-foreground size-5 motion-safe:animate-spin" />

      <div className="w-full max-w-xs">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm">
            {stage ?? "Finding the concepts and pinning them to timestamps"}
          </p>
          <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>

        <div
          className="bg-muted h-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Roadmap progress"
        >
          <div
            className="bg-foreground h-full origin-left rounded-full transition-transform duration-700 ease-out"
            style={{ transform: `scaleX(${Math.max(progress, 2) / 100})` }}
          />
        </div>
      </div>

      <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
        A step with nothing behind it is dropped, so this can finish with fewer
        modules than the material suggests.
      </p>
    </div>
  );
}

function GenerateDialog({
  notebookId,
  disabled,
  pending,
  label = "Generate roadmap",
  onGenerate,
}: {
  notebookId: string;
  disabled: boolean;
  pending: boolean;
  label?: string;
  onGenerate: (
    level: Level,
    goal: string | undefined,
    sourceIds: string[],
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>("some");
  const [goal, setGoal] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);

  const { data: sources } = useSources(notebookId);

  // Only timed, ready sources can carry a pin, so those are the only ones
  // worth offering. A PDF in the list would be a checkbox that changes nothing.
  const eligible = (sources ?? []).filter(
    (source) =>
      (source.type === "YOUTUBE" || source.type === "VTT") &&
      source.status === "READY",
  );

  // Null means "not touched", which is every source. Materialising the full
  // list up front would make a source added later silently excluded.
  const selected = picked ?? eligible.map((source) => source.id);
  const allPicked = selected.length === eligible.length;

  function toggle(id: string) {
    setPicked(
      selected.includes(id)
        ? selected.filter((entry) => entry !== id)
        : [...selected, id],
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant={label === "Regenerate" ? "outline" : "default"}
            disabled={disabled || pending}
          >
            {label}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Build a roadmap</DialogTitle>
          <DialogDescription>
            Concepts are ordered so each builds on the last, and every step is
            pinned to where it is taught. A concept with nothing behind it is
            left out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {levels.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setLevel(option.value)}
              className={cn(
                "flex w-full flex-col items-start rounded-lg border p-3 text-left transition-colors",
                level === option.value
                  ? "border-foreground/40 bg-accent"
                  : "hover:bg-accent/50",
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground text-xs">
                {option.hint}
              </span>
            </button>
          ))}
        </div>

        <Input
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="What are you trying to do? (optional)"
          aria-label="Goal"
          maxLength={500}
        />

        {/* A notebook holding six lectures and one unrelated talk used to get
            all seven ordered into a single path, with no way to say otherwise. */}
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <h3 className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.14em] uppercase">
              Build from
            </h3>
            <span className="text-muted-foreground font-mono text-[0.65rem] tabular-nums">
              {selected.length}/{eligible.length}
            </span>

            {eligible.length > 1 && (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-foreground ml-auto"
                onClick={() =>
                  setPicked(
                    allPicked ? [] : eligible.map((source) => source.id),
                  )
                }
              >
                {allPicked ? "None" : "All"}
              </Button>
            )}
          </div>

          <div className="max-h-40 overflow-y-auto p-1.5">
            {eligible.map((source) => (
              <label
                key={source.id}
                className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5"
              >
                <Checkbox
                  checked={selected.includes(source.id)}
                  onCheckedChange={() => toggle(source.id)}
                />
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  title={source.title}
                >
                  {source.title}
                </span>
              </label>
            ))}
          </div>

          {/* The other half of the question. Realising the material is missing
              is the most likely reason to be looking at this list at all, and
              the sources panel is behind the dialog. */}
          <div className="border-t p-1.5">
            <AddSourceDialog
              notebookId={notebookId}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground w-full justify-start gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Add another source
                </Button>
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => {
              // All of them is sent as an empty list, which the server reads as
              // "every timed source" rather than as a frozen set.
              onGenerate(
                level,
                goal.trim() || undefined,
                allPicked ? [] : selected,
              );
              setOpen(false);
            }}
          >
            {selected.length === eligible.length
              ? "Build it"
              : `Build from ${selected.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
