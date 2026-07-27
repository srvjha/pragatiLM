"use client";

import { useAuthMethods } from "@/features/auth/hooks";

/**
 * The line under the hero buttons, naming how you can actually sign up.
 *
 * It used to be the hardcoded string "Email, Google or GitHub", which was two
 * things wrong at once. It was a list of nouns with no verb, so it read as a
 * label for something rather than a sentence about anything. And it was a
 * promise the deployment could not keep: a social provider exists only when
 * both halves of its credential are set, so an install with no GitHub client
 * id advertised a button on the landing page that the sign in page then did
 * not show. The same endpoint the sign in form reads decides it here.
 *
 * The privacy half is always true and needs no lookup, so it renders on its
 * own while the methods are still in flight rather than the whole line
 * appearing late.
 */
export function SignUpMethods() {
  const { data: methods } = useAuthMethods();

  const social = [
    methods?.google ? "Google" : null,
    methods?.github ? "GitHub" : null,
  ].filter(Boolean) as string[];

  return (
    <p className="text-muted-foreground mt-5 font-mono text-xs">
      {methods && <>{describe(social)} · </>}
      Your notebooks are private to you
    </p>
  );
}

/** "email", "email or Google", "email, Google or GitHub". */
function describe(social: string[]): string {
  if (social.length === 0) return "Sign up with an email and password";
  if (social.length === 1) return `Sign up with email or ${social[0]}`;

  return `Sign up with email, ${social.slice(0, -1).join(", ")} or ${social.at(-1)}`;
}
