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
import { useUiStore } from "@/stores/ui-store";
import type { NotebookListItemDto } from "@/types/api";

type Props = {
  notebooks: NotebookListItemDto[];
};

/** FR-8.5: Cmd+K, or Ctrl+K away from a Mac. */
export function NotebookSwitcher({ notebooks }: Props) {
  const { switcherOpen, setSwitcherOpen, toggleSwitcher } = useUiStore();
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
            {notebooks.map((notebook) => (
              <CommandItem
                key={notebook.id}
                value={notebook.name}
                onSelect={() => {
                  router.push(`/notebook/${notebook.id}`);
                  setSwitcherOpen(false);
                }}
              >
                <span className="truncate">{notebook.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {notebook.sourceCount}{" "}
                  {notebook.sourceCount === 1 ? "source" : "sources"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
