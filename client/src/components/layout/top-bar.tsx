"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth-client";
import { useSignOut } from "@/features/auth/hooks";
import { useNotebooks } from "@/features/notebooks/hooks";
import { useUiStore } from "@/stores/ui-store";

/**
 * The application header.
 *
 * Three zones, left to right: where you are, what you can search, and who you
 * are. The notebook name sits next to the wordmark rather than in the rail
 * alone, because on a narrow screen the rail is a drawer and the header is then
 * the only thing telling you which notebook you are asking questions of.
 */
export function TopBar({ notebookId }: { notebookId?: string }) {
  const { toggleRail, setSwitcherOpen } = useUiStore();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = useSession();
  const { data: notebooks } = useNotebooks();
  const signOut = useSignOut();
  const router = useRouter();

  const current = notebooks?.find((notebook) => notebook.id === notebookId);

  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleRail}
        aria-label="Toggle notebooks"
      >
        <Menu className="size-4" />
      </Button>

      <Wordmark href="/app" size="md" />

      {current && (
        <>
          <span className="text-muted-foreground/50 hidden select-none sm:inline">
            /
          </span>
          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            className="hover:bg-muted hidden max-w-56 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium transition-colors sm:flex"
          >
            <span className="truncate">{current.name}</span>
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
          </button>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSwitcherOpen(true)}
          className="text-muted-foreground hidden gap-2 sm:flex"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
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

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Account"
                className="ml-1 flex size-7 items-center justify-center overflow-hidden rounded-full"
              >
                <Avatar
                  image={session?.user.image ?? null}
                  name={session?.user.name}
                  email={session?.user.email}
                />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium">
                {session?.user.name ?? "Signed in"}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {session?.user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/app")}>
              All notebooks
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOut className="size-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/**
 * The account picture, falling back to an initial.
 *
 * Signing in with Google or GitHub gives us a picture, and showing it is how
 * someone confirms at a glance which account they are in. It can fail to load,
 * though, because it is hosted by the provider and a stale URL simply 404s, so
 * the initial stays underneath rather than leaving an empty circle.
 *
 * A plain <img>, not next/image: these are arbitrary remote hosts, and every
 * one would otherwise have to be listed in the Next config before it renders.
 */
function Avatar({
  image,
  name,
  email,
}: {
  image: string | null;
  name?: string | null;
  email?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const source = name?.trim() || email?.trim() || "";
  const letter = source.charAt(0).toUpperCase() || "?";

  return (
    <span className="bg-primary text-primary-foreground relative flex size-7 items-center justify-center rounded-full text-xs font-semibold">
      {letter}
      {image && !failed && (
        // Sits on top of the initial, so a slow or broken picture degrades to
        // the letter instead of a blank circle.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      )}
    </span>
  );
}
