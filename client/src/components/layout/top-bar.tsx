"use client";

import { useTheme } from "next-themes";
import { Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";

export function TopBar() {
  const { toggleRail, setSwitcherOpen } = useUiStore();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleRail}
        aria-label="Toggle notebooks"
      >
        <Menu className="size-4" />
      </Button>

      <span className="font-semibold">Notebook RAG</span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSwitcherOpen(true)}
          className="text-muted-foreground hidden gap-2 sm:flex"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="bg-muted rounded px-1.5 py-0.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {/* Both icons render and CSS picks one, so there is no hydration
              mismatch to guard against with a mounted flag. */}
          <Moon className="size-4 dark:hidden" />
          <Sun className="hidden size-4 dark:block" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  );
}
