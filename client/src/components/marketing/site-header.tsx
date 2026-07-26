"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { useSession } from "@/lib/auth-client";

/**
 * The marketing header. It knows whether you are signed in, because offering
 * "Sign in" to someone who already is would be the site failing to recognise
 * its own user.
 */
export function SiteHeader() {
  const { data: session, isPending } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-transparent backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Wordmark href="/" size="md" />

        <nav className="text-muted-foreground ml-auto hidden items-center gap-6 text-sm sm:flex">
          <Link href="#how" className="hover:text-foreground transition-colors">
            How it works
          </Link>
          <Link
            href="#sources"
            className="hover:text-foreground transition-colors"
          >
            Sources
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:ml-6">
          {!isPending && session && (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/app">Open your notebooks</Link>}
            />
          )}

          {!isPending && !session && (
            <>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/sign-in">Sign in</Link>}
                className="hidden sm:inline-flex"
              />
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/sign-up">Start a notebook</Link>}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
