"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, LogOut, NotebookPen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth-client";
import { useSignOut } from "@/features/auth/hooks";

/**
 * The account control, shared by the landing header and the app header.
 *
 * It lived only in the app header, so the landing page offered no way to see
 * who you were signed in as or to sign out: the one place someone arriving at
 * the site would look for it was the one place it was missing.
 */
export function AccountMenu() {
  const { data: session } = useSession();
  const signOut = useSignOut();
  const router = useRouter();

  if (!session) return null;

  return (
    <DropdownMenu>
      {/* Children, not `render`. The trigger is already a button, so rendering
          another one inside it nests two buttons and the click never reaches
          the popup: the avatar showed and the menu simply did not open. */}
      <DropdownMenuTrigger
        aria-label="Account"
        className="focus-visible:ring-ring flex size-8 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
      >
        <Avatar
          image={session.user.image ?? null}
          name={session.user.name}
          email={session.user.email}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {/* Base UI requires a group around a label: Menu.GroupLabel reads
            MenuGroupContext, and without it the whole popup throws and never
            opens at all. The trigger looked fine and nothing happened on click. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="flex items-center gap-2.5">
              <Avatar
                image={session.user.image ?? null}
                name={session.user.name}
                email={session.user.email}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {session.user.name}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {session.user.email}
                </span>
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/notebooks")}>
          <NotebookPen className="size-3.5" />
          Your notebooks
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/dashboard")}>
          <BarChart3 className="size-3.5" />
          Dashboard
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut className="size-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The account picture, falling back to an initial.
 *
 * Signing in with Google or GitHub gives us a picture, and showing it is how
 * someone confirms at a glance which account they are in. It can fail to load,
 * because it is hosted by the provider and a stale URL simply 404s, so the
 * initial stays underneath rather than leaving an empty circle.
 *
 * A plain <img>, not next/image: these are arbitrary remote hosts, and every
 * one would otherwise have to be listed in the Next config before it renders.
 */
export function Avatar({
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
    <span className="bg-primary text-primary-foreground relative flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
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
