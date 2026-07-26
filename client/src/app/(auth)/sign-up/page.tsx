import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton mode="sign-up" />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
