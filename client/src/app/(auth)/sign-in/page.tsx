import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The form reads the query string, which Next needs a Suspense boundary around
 * so the page can still be prerendered: the shell is static and the part that
 * depends on the URL fills in on the client.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="sign-in" />}>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
