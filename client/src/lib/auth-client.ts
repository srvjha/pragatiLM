"use client";

import { createAuthClient } from "better-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set. Copy client/.env.example to client/.env.local.",
  );
}

/**
 * Sessions live on the API, not on this app.
 *
 * The web app has no server side of its own here: it is a client that talks to
 * the Express API, and the session cookie is set by that origin. So the auth
 * client points at the API and every other request opts in to sending
 * credentials. Route guards in this app are presentation only; the server
 * refuses unauthenticated requests regardless of what the client renders.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});

export const { signIn, signUp, signOut, useSession } = authClient;
