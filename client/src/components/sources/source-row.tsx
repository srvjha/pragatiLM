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
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon
            className="text-muted-foreground size-3.5 shrink-0"
            strokeWidth={1.5}
          />
          <span className="min-w-0 flex-1 truncate text-sm">
            {source.title}
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

      {/* FR-2.10: a failure states its reason in the row and offers a retry, so
          it is never a silent red dot. */}
      {failed && (
        <div className="text-destructive mt-0.5 mb-1 ml-8 flex items-start gap-2 pr-2 text-xs">
          <span className="flex-1">
            {source.errorMessage ?? "Indexing failed"}
          </span>
          <button
            type="button"
            onClick={onReindex}
            className="hover:text-foreground inline-flex shrink-0 items-center gap-1 underline"
          >
            <RotateCw className="size-3" />
            Retry
          </button>
        </div>
      )}
    </li>
  );
}
