"use client";

import { useTheme } from "next-themes";
import { ChevronsUpDown, Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Wordmark } from "@/components/brand/wordmark";
import { AccountMenu } from "@/components/auth/account-menu";
import { useNotebooks } from "@/features/notebooks/hooks";
import { useUiStore } from "@/stores/ui-store";

/**
 * The application header.
 *
 * Three zones, left to right: where you are, what you can search, and who you
 * are. The notebook name sits next to the wordmark rather than in the rail
 * alone, because on a narrow screen the rail is a drawer and the header is then
 * the only thing telling you which notebook you are asking questions of.
 *
 * Every control in this band is 32px tall. The account avatar is fixed at that
 * size and cannot move, so the rest matches it rather than leaving a row of
 * near-misses that read as sloppy at a glance.
 */
export function TopBar({ notebookId }: { notebookId?: string }) {
  const { toggleRail, setSwitcherOpen, railOpen } = useUiStore();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: notebooks } = useNotebooks();

  const current = notebooks?.find((notebook) => notebook.id === notebookId);

  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-1.5 border-b px-3">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={toggleRail}
              aria-label="Toggle notebooks"
              aria-expanded={railOpen}
            >
              <Menu className="size-4" />
            </Button>
          }
        />
        <TooltipContent>Notebooks</TooltipContent>
      </Tooltip>

      <Wordmark href="/app" size="md" />

      {current && (
        <>
          {/* The breadcrumb used to disappear below 640px, which is exactly the
              width where the rail has collapsed into a drawer and the header is
              the only thing naming the notebook. It now truncates instead. */}
          <span
            className="text-muted-foreground/50 select-none"
            aria-hidden="true"
          >
            /
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setSwitcherOpen(true)}
                  aria-haspopup="dialog"
                  title={current.name}
                  className="hover:bg-muted focus-visible:ring-ring/50 focus-visible:border-ring flex h-8 min-w-0 max-w-40 items-center gap-1.5 rounded-lg border border-transparent pr-1.5 pl-1 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none sm:max-w-64"
                >
                  {/* The marker earns its place here: it is not decoration but
                      the answer to "which notebook am I asking?", the same claim
                      the rail makes about its active row. */}
                  <span
                    className="bg-marker h-4 w-[3px] shrink-0 rounded-full"
                    aria-hidden="true"
                  />
                  <span className="truncate">{current.name}</span>
                  <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
                </button>
              }
            />
            <TooltipContent>Switch notebook</TooltipContent>
          </Tooltip>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          onClick={() => setSwitcherOpen(true)}
          aria-keyshortcuts="Meta+K Control+K"
          className="text-muted-foreground hidden gap-2 sm:flex"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
            ⌘K
          </kbd>
        </Button>

        {/* Below the search button's breakpoint the shortcut is unreachable
            anyway, so the same action stays available as an icon. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                aria-label="Search notebooks"
                onClick={() => setSwitcherOpen(true)}
              >
                <Search className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Search notebooks</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle theme"
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
              >
                {/* Both icons render and CSS picks one, so there is no hydration
                    mismatch to guard against with a mounted flag. */}
                <Moon className="size-4 dark:hidden" />
                <Sun className="hidden size-4 dark:block" />
              </Button>
            }
          />
          <TooltipContent>
            <span className="hidden dark:inline">Switch to light</span>
            <span className="dark:hidden">Switch to dark</span>
          </TooltipContent>
        </Tooltip>

        <AccountMenu />
      </div>
    </header>
  );
}
