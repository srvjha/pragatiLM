"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { useSession } from "@/lib/auth-client";
import { AccountMenu } from "@/components/auth/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Root-relative rather than bare fragments, because this header is no longer
 * only on the landing page. From /pricing a bare "#how" points at a section that
 * is not on the page and quietly does nothing; "/#how" goes to the section.
 */
const links = [
  { label: "How it works", href: "/#how" },
  { label: "Sources", href: "/#sources" },
  { label: "Refusals", href: "/#refusal" },
  { label: "Pricing", href: "/pricing" },
];

/**
 * The marketing header. It knows whether you are signed in, because offering
 * "Sign in" to someone who already is would be the site failing to recognise
 * its own user.
 *
 * Over the hero it is transparent and part of the page; once the page has
 * moved under it, it takes a ground and a hairline so the text scrolling
 * beneath does not run into the navigation.
 */
export function SiteHeader() {
  const { data: session, isPending } = useSession();
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    // Passive, and reading a single scalar, so this costs nothing per frame.
    function onScroll() {
      setLifted(window.scrollY > 8);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        lifted
          ? "bg-background/80 border-border backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Wordmark href="/" size="md" />

        <nav
          aria-label="Sections"
          className="text-muted-foreground ml-auto hidden items-center gap-7 text-sm sm:flex"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-foreground focus-visible:ring-ring relative rounded-sm py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* ml-auto on both this and the nav meant the nav never actually
            pushed right on a narrow window; the gap belongs here instead. */}
        <div className="ml-auto flex items-center gap-1 sm:ml-8 sm:gap-2">
          <ThemeToggle className="size-8" />

          {isPending && (
            <div
              className="bg-muted h-7 w-24 animate-pulse rounded-md"
              aria-hidden
            />
          )}

          {!isPending && session && (
            <>
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/notebooks">Open your notebooks</Link>}
              />
              <AccountMenu />
            </>
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
