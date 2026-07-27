import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Start a pragatiLM notebook that answers only from your own sources.",
};

/**
 * The same Suspense boundary as sign in, and for the same reason: the form
 * reads the query string, so the shell stays static and the part that depends
 * on the URL fills in on the client.
 */
export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="sign-up" />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
