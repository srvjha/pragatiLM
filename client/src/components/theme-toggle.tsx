"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Light and dark, in one control.
 *
 * Both icons are always rendered and CSS decides which is visible, which is
 * the whole trick: the theme is only known on the client, so reading it during
 * render to pick an icon is a hydration mismatch, and the usual workaround of
 * a `mounted` flag leaves a hole in the toolbar on first paint. The dark
 * variant is already applied to the html element before React hydrates, so the
 * right icon is showing from the very first frame.
 *
 * `resolvedTheme` rather than `theme`, because someone on "system" in the dark
 * needs this to switch them to light, and `theme` would read "system" and
 * flip them to dark instead — a button that visibly does nothing.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label="Switch between light and dark"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
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
  );
}
