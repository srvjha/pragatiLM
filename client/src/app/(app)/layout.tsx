"use client";

import { Loader2 } from "lucide-react";
import { useRequireSession } from "@/features/auth/hooks";

/**
 * Every signed-in route needs a session.
 *
 * The group is what makes one guard enough. `(app)` contributes nothing to the
 * URL, so /notebooks and /dashboard read as themselves while still sharing
 * this layout: the folder is the boundary, and the paths do not have to carry
 * a prefix just to say which layout wraps them.
 *
 * The guard here is so a signed out visitor gets sent to sign in instead of
 * watching every panel fail with a 401. It is not the security boundary; the
 * API refuses the requests either way.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, isPending } = useRequireSession();

  if (isPending || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  return <>{children}</>;
}
