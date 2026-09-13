"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/features/admin/hooks";

/**
 * The way into the admin dashboard, in both headers.
 *
 * It lived inside the account dropdown first, which meant the one person who
 * uses this had to open a menu on every page to reach the thing they check most
 * often. A standing button costs one slot in a header nobody else ever sees it
 * in, because the component renders nothing at all unless `/admin/me` succeeds.
 *
 * That gate is the same call the page itself makes. A non-admin never renders
 * this, and a signed out visitor never even issues the request.
 *
 * Deliberately NOT marker yellow, even though a yellow pill is the obvious way
 * to make a button shout. globals.css is explicit that marker is "used ONLY
 * where the product has actually matched something: a cited span, the active
 * notebook, a hovered citation. Never decoration." A nav button is decoration.
 * Spending the highlighter on it would weaken the one place in the product
 * where yellow means something.
 *
 * This palette has no accent hue on purpose, and says so: "the primary action
 * is simply ink on paper, and its inverse on a dark ground." So prominence here
 * is the solid ink fill, which is the loudest thing the system offers, plus a
 * shield so it reads as a different kind of destination from the customer
 * navigation it sits beside.
 */
export function AdminLink({ className }: { className?: string }) {
  const isAdmin = useIsAdmin();
  const pathname = usePathname();

  if (!isAdmin) return null;

  const active = pathname.startsWith("/admin");

  return (
    <Link
      href="/admin"
      aria-current={active ? "page" : undefined}
      title="Admin dashboard"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5",
        "text-[13px] font-medium whitespace-nowrap",
        "bg-primary text-primary-foreground hover:bg-primary/80",
        "transition-colors",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        // A ring rather than a colour change when active: the fill is already
        // the loudest thing the palette has, and making it louder reads as a
        // rendering bug rather than as emphasis.
        active && "ring-ring ring-2 ring-offset-2",
        className,
      )}
    >
      <ShieldIcon className="size-3.5" aria-hidden />
      {/* The word is hidden on the narrowest widths, where the header is
          already fighting for room, but the icon and the title remain. */}
      <span className="hidden sm:inline">Admin</span>
    </Link>
  );
}
