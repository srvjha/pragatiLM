"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { NotebookListItemDto } from "@/types/api";

type Props = {
  notebooks: NotebookListItemDto[];
};

/** FR-8.5: Cmd+K, or Ctrl+K away from a Mac. */
export function NotebookSwitcher({ notebooks }: Props) {
  // One selector per value. Destructuring the store subscribes this component
  // to every field in it, so the switcher re-rendered on things it has no
  // interest in at all: dragging the source column wider, or the viewer
  // opening, used to re-render a dialog that was not even on screen.
  const switcherOpen = useUiStore((state) => state.switcherOpen);
  const setSwitcherOpen = useUiStore((state) => state.setSwitcherOpen);
  const toggleSwitcher = useUiStore((state) => state.toggleSwitcher);
  const activeNotebookId = useUiStore((state) => state.activeNotebookId);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSwitcher();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSwitcher]);

  return (
    <CommandDialog
      open={switcherOpen}
      onOpenChange={setSwitcherOpen}
      title="Switch notebook"
      description="Search your notebooks by name"
    >
      <Command>
        <CommandInput placeholder="Search notebooks..." />
        <CommandList>
          <CommandEmpty>No notebook matches that.</CommandEmpty>
          <CommandGroup heading="Notebooks">
            {notebooks.map((notebook) => {
              const active = notebook.id === activeNotebookId;

              return (
                <CommandItem
                  key={notebook.id}
                  value={notebook.name}
                  onSelect={() => {
                    router.push(`/notebooks/${notebook.id}`);
                    setSwitcherOpen(false);
                  }}
                >
                  {/* The marker for the notebook you are already in. This is
                      one of the two places the palette reserves it for: it
                      means "this is the live one", not decoration. */}
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      active ? "bg-marker" : "bg-transparent",
                    )}
                  />
                  <span className="truncate">{notebook.name}</span>
                  {active && (
                    <span className="text-muted-foreground font-mono text-[0.6rem] tracking-wider uppercase">
                      current
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
                    {notebook.sourceCount}{" "}
                    {notebook.sourceCount === 1 ? "source" : "sources"}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
