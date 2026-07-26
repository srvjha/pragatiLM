"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Map, Pin, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    mutationFn: ({ level, goal }: { level: Level; goal?: string }) =>
      api.generateRoadmap(notebookId, level, goal),
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
          disabled={!canGenerate}
          pending={generate.isPending}
          onGenerate={(level, goal) => generate.mutate({ level, goal })}
        />
      </div>
    );
  }

  if (roadmap.status === "QUEUED" || roadmap.status === "RUNNING") {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-sm">
        <RotateCw className="size-5 animate-spin" />
        Finding the concepts and pinning them to timestamps...
      </div>
    );
  }

  if (roadmap.status === "FAILED") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-destructive text-sm">
          {roadmap.errorMessage ?? "Generation failed."}
        </p>
        <GenerateDialog
          disabled={!canGenerate}
          pending={generate.isPending}
          onGenerate={(level, goal) => generate.mutate({ level, goal })}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Learning roadmap</h2>
        <GenerateDialog
          disabled={!canGenerate}
          pending={generate.isPending}
          label="Regenerate"
          onGenerate={(level, goal) => generate.mutate({ level, goal })}
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

function GenerateDialog({
  disabled,
  pending,
  label = "Generate roadmap",
  onGenerate,
}: {
  disabled: boolean;
  pending: boolean;
  label?: string;
  onGenerate: (level: Level, goal?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>("some");
  const [goal, setGoal] = useState("");

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

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onGenerate(level, goal.trim() || undefined);
              setOpen(false);
            }}
          >
            Build it
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
