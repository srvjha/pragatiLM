"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RelativeTime } from "./relative-time";
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
    // The padding matches the row's, so the list does not shift under the
    // cursor when a name is being changed.
    return (
      <li className="px-2 py-2">
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
          "group relative flex items-center gap-1 rounded-lg pr-1 pl-2 transition-colors",
          active ? "bg-accent" : "hover:bg-accent/60",
          pending && "opacity-60",
        )}
      >
        {/* The marker is the one place in the rail it is allowed: it marks the
            notebook currently open, which is the product having matched
            something, not decoration. */}
        {active && (
          <span
            aria-hidden
            className="bg-marker absolute inset-y-2 left-0 w-[3px] rounded-full"
          />
        )}

        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => !pending && setEditing(true)}
          title={notebook.name}
          className="focus-visible:outline-ring flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-current={active ? "page" : undefined}
        >
          <span className="w-full truncate text-sm leading-5 font-medium">
            {notebook.name}
          </span>
          <span className="text-muted-foreground w-full truncate font-mono text-[0.7rem] leading-4">
            {notebook.sourceCount}{" "}
            {notebook.sourceCount === 1 ? "source" : "sources"}
            {" · "}
            {pending ? (
              "saving…"
            ) : (
              <RelativeTime iso={notebook.lastActivityAt} />
            )}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            aria-label={`Actions for ${notebook.name}`}
            className="hover:bg-background/70 focus-visible:outline-ring inline-flex size-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 data-[popup-open]:opacity-100 motion-reduce:transition-none"
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
