"use client";

import { Loader2 } from "lucide-react";
import { useRequireSession } from "@/features/auth/hooks";

/**
 * Everything under /app needs a session.
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
