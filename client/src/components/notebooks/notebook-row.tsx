"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isOptimistic } from "@/features/notebooks/hooks";
import type { NotebookListItemDto } from "@/types/api";

type Props = {
  notebook: NotebookListItemDto;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
};

export function NotebookRow({
  notebook,
  active,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notebook.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // A row that has not been confirmed by the server has no real id yet, so
  // renaming or deleting it would target something that does not exist.
  const pending = isOptimistic(notebook.id);

  function commit() {
    const name = draft.trim();
    setEditing(false);

    if (!name || name === notebook.name) {
      setDraft(notebook.name);
      return;
    }
    onRename(name);
  }

  if (editing) {
    return (
      <li className="px-2">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(notebook.name);
              setEditing(false);
            }
          }}
          className="h-9"
          aria-label="Notebook name"
        />
      </li>
    );
  }

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-2 transition-colors",
          active ? "bg-accent" : "hover:bg-accent/60",
          pending && "opacity-60",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => !pending && setEditing(true)}
          className="flex min-w-0 flex-1 flex-col items-start py-2 text-left"
          aria-current={active ? "true" : undefined}
        >
          <span className="w-full truncate text-sm font-medium">
            {notebook.name}
          </span>
          <span className="text-muted-foreground text-xs">
            {notebook.sourceCount}{" "}
            {notebook.sourceCount === 1 ? "source" : "sources"}
            {" · "}
            {formatDistanceToNow(new Date(notebook.lastActivityAt), {
              addSuffix: true,
            })}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            aria-label={`Actions for ${notebook.name}`}
            className="hover:bg-accent focus-visible:ring-ring inline-flex size-7 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none data-[popup-open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
