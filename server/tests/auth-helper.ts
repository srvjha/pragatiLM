import request from "supertest";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * A signed in client for the HTTP tests.
 *
 * `request.agent` keeps cookies between calls, which is exactly how a browser
 * carries the session, so tests exercise the same path a real client takes
 * rather than a bypass. Sign up rather than a hand written row, so the password
 * hashing and the session issuing are covered too.
 *
 * The reset in `setup.ts` truncates users before every test, so each test signs
 * up its own account. Reusing one across tests would either fail on the second
 * or quietly depend on ordering.
 */
export async function signedIn(app: Express, email = "member@example.com") {
  const agent = request.agent(app);

  const response = await agent
    .post("/api/auth/sign-up/email")
    .send({ name: "Member", email, password: "a-strong-password" });

  if (response.status !== 200) {
    throw new Error(`sign up failed (${response.status}): ${JSON.stringify(response.body)}`);
  }

  return agent;
}

/**
 * The same signed in client, plus the user's id.
 *
 * Anything scoped to a person rather than to a notebook — billing above all —
 * needs the id, and reading it back from the row is how a test gets the id the
 * session actually belongs to rather than one it invented.
 */
export async function signedInUser(app: Express, email = "member@example.com") {
  const agent = await signedIn(app, email);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error(`signed up ${email} but no user row exists`);

  return { agent, id: user.id };
}
