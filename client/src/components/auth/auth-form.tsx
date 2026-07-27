"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signUp } from "@/lib/auth-client";
import { useAuthMethods } from "@/features/auth/hooks";
import { GitHubIcon, GoogleIcon } from "./provider-icons";

type Mode = "sign-in" | "sign-up";
type Provider = "google" | "github";

/**
 * Which fields the message is about. A rejected credential says something about
 * what was typed, so those fields are marked invalid and point at it; an OAuth
 * round trip that failed somewhere else does not, and marking the email box red
 * because GitHub timed out would be a lie about where the problem is.
 */
type AuthError = { kind: "credentials" | "oauth"; message: string };

const ERROR_ID = "auth-error";
const PASSWORD_HINT_ID = "password-hint";

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
  const [error, setError] = useState<AuthError | null>(() =>
    oauthError(params.get("error")),
  );
  const [busy, setBusy] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);

  /**
   * Every route out of this card is one attempt at a time. Leaving the social
   * buttons live during a submit invites a second sign in over the top of one
   * already in flight, and the second one wins for no reason anyone chose.
   */
  const blocked = busy || pendingProvider !== null;
  const fieldsInvalid = error?.kind === "credentials";

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
      setError({
        kind: "credentials",
        message:
          result.error.message ??
          "That did not work. Check the details and try again.",
      });
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
  function social(provider: Provider) {
    return signIn.social({
      provider,
      callbackURL: `${window.location.origin}/app`,
      // Without this, a refused or cancelled sign in lands on an API error page
      // rather than back here with something to read.
      errorCallbackURL: `${window.location.origin}/sign-in?error=oauth`,
    });
  }

  /**
   * The success path here is a full page navigation, so the pending state is
   * usually never cleared and does not need to be. It is cleared on the path
   * that resolves without going anywhere, which is the one where a button left
   * spinning would be claiming something is still happening when nothing is.
   */
  async function startSocial(provider: Provider) {
    setError(null);
    setPendingProvider(provider);

    const result = await social(provider).catch(() => null);

    if (!result || result.error) {
      setPendingProvider(null);
      setError({
        kind: "oauth",
        message:
          result?.error?.message ??
          "That sign in could not be started. Try again, or use your email and password.",
      });
    }
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-[1.65rem] leading-tight font-semibold">
          {text.heading}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
          {text.lede}
        </p>
      </div>

      {hasSocial && (
        <div className="space-y-5">
          <div className="grid gap-2.5">
            {methods?.google && (
              <ProviderButton
                label="Continue with Google"
                icon={<GoogleIcon className="size-4" />}
                pending={pendingProvider === "google"}
                disabled={blocked}
                onClick={() => void startSocial("google")}
              />
            )}
            {methods?.github && (
              <ProviderButton
                label="Continue with GitHub"
                icon={<GitHubIcon className="size-4" />}
                pending={pendingProvider === "github"}
                disabled={blocked}
                onClick={() => void startSocial("github")}
              />
            )}
          </div>

          {/* Decorative: the rules and the word carry no information the
              buttons and the fields below them do not already carry. */}
          <div className="flex items-center gap-3" aria-hidden>
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.14em] uppercase">
              or
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
        </div>
      )}

      <form
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-4"
        aria-busy={busy}
      >
        {mode === "sign-up" && (
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              autoCapitalize="words"
              required
              maxLength={120}
              className="h-10 px-3"
              aria-invalid={fieldsInvalid || undefined}
              aria-describedby={describedBy(fieldsInvalid && ERROR_ID)}
            />
          </Field>
        )}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="h-10 px-3"
            aria-invalid={fieldsInvalid || undefined}
            aria-describedby={describedBy(fieldsInvalid && ERROR_ID)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={mode === "sign-up" ? "At least 10 characters." : undefined}
          hintId={PASSWORD_HINT_ID}
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
            className="h-10 px-3"
            aria-invalid={fieldsInvalid || undefined}
            aria-describedby={describedBy(
              mode === "sign-up" && PASSWORD_HINT_ID,
              fieldsInvalid && ERROR_ID,
            )}
          />
        </Field>

        {error && (
          <div
            id={ERROR_ID}
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{error.message}</span>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="h-10 w-full"
          disabled={blocked}
          aria-busy={busy}
        >
          {/* Hidden rather than frozen for anyone who asked for less motion: a
              stationary spinner reads as a broken icon, and the label change
              and aria-busy are already saying the same thing. */}
          {busy && (
            <Loader2
              className="size-4 animate-spin motion-reduce:hidden"
              aria-hidden
            />
          )}
          {busy ? "One moment" : text.action}
        </Button>
      </form>

      <p className="text-muted-foreground border-t pt-5 text-sm">
        {text.swapPrompt}{" "}
        <Link
          href={text.swapHref}
          className="text-primary focus-visible:ring-ring/50 focus-visible:border-ring -mx-1 -my-1.5 inline-block rounded-sm border border-transparent px-1 py-1.5 font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
        >
          {text.swapAction}
        </Link>
      </p>
    </div>
  );
}

/**
 * The two providers are the same button with a different mark, built from one
 * definition so they cannot drift into looking like a first and second choice.
 */
function ProviderButton({
  label,
  icon,
  pending,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="lg"
      type="button"
      className="h-10 w-full"
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending}
    >
      {pending ? (
        <Loader2
          className="size-4 animate-spin motion-reduce:hidden"
          aria-hidden
        />
      ) : (
        icon
      )}
      {label}
    </Button>
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
function oauthError(code: string | null): AuthError | null {
  if (!code) return null;

  if (code === "state_mismatch") {
    return {
      kind: "oauth",
      message:
        "That sign in took too long, or it was started in another tab. Please try again.",
    };
  }

  return {
    kind: "oauth",
    message:
      "That sign in did not complete. Try again, or use your email and password.",
  };
}

/** Joins the ids that are actually present, since an empty string would point
 *  assistive technology at nothing. */
function describedBy(...ids: (string | false | undefined)[]) {
  const present = ids.filter((id): id is string => Boolean(id));
  return present.length > 0 ? present.join(" ") : undefined;
}

function Field({
  label,
  htmlFor,
  hint,
  hintId,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  hintId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}
