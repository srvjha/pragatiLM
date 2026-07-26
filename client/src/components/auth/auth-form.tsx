"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signUp } from "@/lib/auth-client";
import { useAuthMethods } from "@/features/auth/hooks";
import { GitHubIcon, GoogleIcon } from "./provider-icons";

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
  const params = useSearchParams();
  const { data: methods } = useAuthMethods();
  const text = copy[mode];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /**
   * A failed OAuth round trip comes back here with the reason in the query
   * string, so the person sees why they are still on the sign in screen.
   *
   * Read as the initial state rather than synced in an effect: the query string
   * is fixed for the life of this mount, so there is nothing to keep in sync.
   * Reading it off `window` instead would render one thing on the server and
   * another on the client, which is a hydration mismatch; useSearchParams is
   * the API that handles that, and the Suspense boundary the page puts around
   * this component is what it needs to do so.
   */
  const [error, setError] = useState<string | null>(() =>
    oauthError(params.get("error")),
  );
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

  /**
   * Starts an OAuth round trip.
   *
   * Both callback URLs are absolute, and that is the whole point. Better Auth
   * resolves a relative path against its own baseURL, which is the API, so
   * "/app" sends the browser to the API's /app and lands on a JSON 404 after an
   * otherwise successful sign in. The web app's own origin is what we want, and
   * the browser is the thing that knows it.
   *
   * The origin has to be listed in the server's WEB_ORIGIN for Better Auth to
   * accept it, which is the same check that stops an open redirect.
   */
  function social(provider: "google" | "github") {
    return signIn.social({
      provider,
      callbackURL: `${window.location.origin}/app`,
      // Without this, a refused or cancelled sign in lands on an API error page
      // rather than back here with something to read.
      errorCallbackURL: `${window.location.origin}/sign-in?error=oauth`,
    });
  }

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
                onClick={() => void social("google")}
              >
                <GoogleIcon className="size-4" />
                Continue with Google
              </Button>
            )}
            {methods?.github && (
              <Button
                variant="outline"
                size="lg"
                type="button"
                onClick={() => void social("github")}
              >
                <GitHubIcon className="size-4" />
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

/**
 * A sign in that failed somewhere in the OAuth round trip comes back here with
 * the reason in the query string. state_mismatch is the one worth naming: it
 * almost always means the attempt was left too long, since the state cookie
 * lives five minutes, or that an older tab was completed after a newer attempt
 * replaced it. "Something went wrong" would send someone hunting a
 * configuration problem that is not there.
 */
function oauthError(code: string | null): string | null {
  if (!code) return null;

  if (code === "state_mismatch") {
    return "That sign in took too long, or it was started in another tab. Please try again.";
  }

  return "That sign in did not complete. Try again, or use your email and password.";
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
