"use client";

import { useEffect, useRef, useState } from "react";
import {
  Captions,
  FileText,
  Globe,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCw,
  Trash2,
  Type,
  FileVideo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  dotClass,
  dotLabel,
  dotStateFor,
  statusTooltip,
} from "@/lib/source-status";
import type { SourceDto, SourceType } from "@/types/api";

const typeIcon: Record<SourceType, typeof FileText> = {
  PDF: FileText,
  TEXT: Type,
  WEB: Globe,
  YOUTUBE: FileVideo,
  VTT: Captions,
};

type Props = {
  source: SourceDto;
  onToggle: (selected: boolean) => void;
  onRename: (title: string) => void;
  onReindex: () => void;
  onDelete: () => void;
  onOpen: () => void;
};

export function SourceRow({
  source,
  onToggle,
  onRename,
  onReindex,
  onDelete,
  onOpen,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // The title can change under the row while it is idle, because indexing
  // replaces a placeholder with the real one. Seeding the draft on entry rather
  // than syncing it keeps the live value authoritative without an effect.
  function startEditing() {
    setDraft(source.title);
    setEditing(true);
  }

  const Icon = typeIcon[source.type];
  const state = dotStateFor(source.status);
  const failed = state === "failed";
  const working = state === "uploading" || state === "indexing";

  function commit() {
    const title = draft.trim();
    setEditing(false);

    if (!title || title === source.title) {
      setDraft(source.title);
      return;
    }
    onRename(title);
  }

  if (editing) {
    return (
      <li className="px-2 py-1">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(source.title);
              setEditing(false);
            }
          }}
          className="h-8"
          aria-label="Source title"
        />
      </li>
    );
  }

  return (
    <li>
      <div className="group hover:bg-accent/60 flex items-center gap-2 rounded-md px-2 py-1.5">
        {/* FR-2.14: only checked sources are retrieved from. */}
        <Checkbox
          checked={source.selected}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`Use ${source.title} for answers`}
        />

        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={startEditing}
          // The panel is narrow and source titles are long, so the full one has
          // to be recoverable without opening the source.
          title={source.title}
          className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <Icon
            className="text-muted-foreground size-3.5 shrink-0"
            strokeWidth={1.5}
          />

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{source.title}</span>

            {/* While a source is being indexed the row is the only place that
                says so. A pulsing dot alone reported "something is happening"
                and never which stage or how far in, which on a long PDF is
                indistinguishable from stuck. */}
            {working && (
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 font-mono text-[0.65rem]">
                <span className="truncate">
                  {source.statusStage ?? dotLabel[state]}
                </span>
                {source.progress > 0 && (
                  <span className="tabular-nums opacity-70">
                    {source.progress}%
                  </span>
                )}
              </span>
            )}
          </span>

          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label={dotLabel[state]}
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    dotClass[state],
                  )}
                />
              }
            />
            <TooltipContent>{statusTooltip(source)}</TooltipContent>
          </Tooltip>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${source.title}`}
            className="hover:bg-accent focus-visible:ring-ring inline-flex size-6 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none data-[popup-open]:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={startEditing}>
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onReindex}>
              <RefreshCw className="size-4" />
              Re-index
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress as a line rather than a number alone, because the useful
          question during indexing is "is this moving", and a bar answers it at
          a glance where a percentage has to be read and remembered. */}
      {working && source.progress > 0 && (
        <div
          className="bg-muted mx-2 mb-1.5 h-0.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={source.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Indexing ${source.title}`}
        >
          <div
            className="bg-foreground/40 h-full origin-left rounded-full transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${source.progress / 100})` }}
          />
        </div>
      )}

      {/* FR-2.10: a failure states its reason in the row and offers a retry, so
          it is never a silent red dot. */}
      {failed && (
        <div className="border-destructive/30 bg-destructive/5 mt-1 mb-1.5 ml-8 rounded-md border px-2.5 py-2 pr-2">
          <p
            className="text-destructive line-clamp-3 text-xs leading-relaxed"
            title={source.errorMessage ?? undefined}
          >
            {source.errorMessage ?? "Indexing failed"}
          </p>
          <button
            type="button"
            onClick={onReindex}
            className="text-destructive hover:text-foreground focus-visible:ring-ring mt-1.5 inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            <RotateCw className="size-3" />
            Try indexing again
          </button>
        </div>
      )}
    </li>
  );
}
