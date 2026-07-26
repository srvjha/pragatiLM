"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { useSession, signOut } from "@/lib/auth-client";

/** Which sign in methods the server actually has credentials for. */
export type AuthMethods = {
  emailAndPassword: boolean;
  google: boolean;
  github: boolean;
};

/**
 * Social buttons are rendered from this rather than assumed, so an unconfigured
 * provider is absent instead of present and broken.
 */
export function useAuthMethods() {
  return useQuery({
    queryKey: ["auth-methods"],
    queryFn: () => apiFetch<AuthMethods>("/auth-methods"),
    staleTime: Infinity,
  });
}

/**
 * Redirects to sign in when there is no session.
 *
 * This is convenience, not security. It keeps a signed out visitor from staring
 * at an empty workspace while every request behind it 401s; the actual refusal
 * happens on the server.
 */
export function useRequireSession() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  return { session, isPending };
}

/** Signs out and returns to the landing page. */
export function useSignOut() {
  const router = useRouter();

  return async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };
}
