"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signUp } from "@/lib/auth-client";
import { useAuthMethods } from "@/features/auth/hooks";

type Mode = "sign-in" | "sign-up";

const copy = {
  "sign-in": {
    heading: "Sign in",
    lede: "Your notebooks are where you left them.",
    action: "Sign in",
    swapPrompt: "New here?",
    swapAction: "Create an account",
    swapHref: "/sign-up",
  },
  "sign-up": {
    heading: "Create an account",
    lede: "Notebooks are private to you. Nothing is shared and nothing is used to train a model.",
    action: "Create account",
    swapPrompt: "Already have an account?",
    swapAction: "Sign in",
    swapHref: "/sign-in",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { data: methods } = useAuthMethods();
  const text = copy[mode];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const result =
      mode === "sign-up"
        ? await signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
          })
        : await signIn.email({ email: email.trim(), password });

    setBusy(false);

    if (result.error) {
      // The server's own wording, which names the actual problem, rather than a
      // generic failure that leaves the person guessing which field is wrong.
      setError(
        result.error.message ??
          "That did not work. Check the details and try again.",
      );
      return;
    }

    router.push("/app");
    router.refresh();
  }

  const hasSocial = methods?.google || methods?.github;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">{text.heading}</h1>
        <p className="text-muted-foreground text-sm">{text.lede}</p>
      </div>

      {hasSocial && (
        <>
          <div className="grid gap-2">
            {methods?.google && (
              <Button
                variant="outline"
                size="lg"
                type="button"
                onClick={() =>
                  void signIn.social({
                    provider: "google",
                    callbackURL: "/app",
                  })
                }
              >
                Continue with Google
              </Button>
            )}
            {methods?.github && (
              <Button
                variant="outline"
                size="lg"
                type="button"
                onClick={() =>
                  void signIn.social({
                    provider: "github",
                    callbackURL: "/app",
                  })
                }
              >
                Continue with GitHub
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
        {mode === "sign-up" && (
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
              maxLength={120}
              className="h-9"
            />
          </Field>
        )}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="h-9"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={mode === "sign-up" ? "At least 10 characters." : undefined}
        >
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "sign-up" ? 10 : undefined}
            className="h-9"
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="border-stamp/30 bg-stamp/5 text-stamp rounded-md border px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "One moment" : text.action}
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        {text.swapPrompt}{" "}
        <Link
          href={text.swapHref}
          className="text-primary underline-offset-4 hover:underline"
        >
          {text.swapAction}
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
