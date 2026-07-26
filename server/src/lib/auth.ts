import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { authSecret, env, socialProviders } from "@/config/env";
import { childLogger } from "@/lib/logger";

const log = childLogger("auth");

/**
 * Session handling for the whole API.
 *
 * Email and password is always on, because it needs no third party credential:
 * the product is usable the moment the database is up. Social providers are
 * registered only when their credentials are present, so an unfilled `.env`
 * yields a sign in page with one working method rather than buttons that fail
 * on click.
 */
const social: Record<string, { clientId: string; clientSecret: string }> = {};

if (socialProviders.google) {
  social.google = {
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
  };
}

if (socialProviders.github) {
  social.github = {
    clientId: env.GITHUB_CLIENT_ID!,
    clientSecret: env.GITHUB_CLIENT_SECRET!,
  };
}

log.info(
  { google: socialProviders.google, github: socialProviders.github },
  "social providers configured",
);

export const auth = betterAuth({
  appName: "doChatLM",
  secret: authSecret,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  // The web app runs on its own origin and talks to this API with credentials,
  // so its origin has to be trusted for both CORS and OAuth redirects.
  trustedOrigins: env.WEB_ORIGIN,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // No mail transport is configured, so requiring verification would lock
    // every new account out of the product. Sign up is immediate and the
    // verification flag stays false until a transport exists to flip it.
    requireEmailVerification: false,
    autoSignIn: true,
  },

  socialProviders: social,

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    // Sliding expiry: a session in daily use is refreshed at most once a day
    // rather than on every request, which keeps the write off the hot path.
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    database: {
      // Every other table in this schema keys on uuid and `notebooks.user_id`
      // carries a real foreign key, so ids have to be uuids rather than Better
      // Auth's default text.
      generateId: () => randomUUID(),
    },
    // SameSite is about the registrable domain, not the origin. In development
    // the API and the web app are both on `localhost`, and in a deployment
    // where they are `api.example.com` and `example.com` they are still one
    // site, so a lax cookie is sent on the app's fetch calls in both cases.
    //
    // Put them on genuinely different domains, which is what happens when the
    // web app is on one host's subdomain and the API on another's, and lax
    // stops being sent on anything except top level navigation. Every request
    // then arrives without a session and the whole app reads as signed out
    // while sign in itself appears to succeed. AUTH_COOKIE_CROSS_SITE exists
    // for exactly that deployment; it requires HTTPS on both sides, which is
    // why it forces `secure` on regardless of NODE_ENV.
    //
    // `secure` otherwise keys on production rather than on "not development",
    // because the test environment is neither: it drives the app over plain
    // http, where a secure cookie is silently dropped.
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: env.AUTH_COOKIE_CROSS_SITE ? "none" : "lax",
      secure: env.AUTH_COOKIE_CROSS_SITE || env.NODE_ENV === "production",
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
