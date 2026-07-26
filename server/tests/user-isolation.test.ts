import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { db } from "@/db/client";
import { notebooks, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signedIn } from "./auth-helper";
import type { NotebookDto, NotebookListItemDto } from "@/types/api";

const app = createApp();

/**
 * A notebook belongs to exactly one account, and the boundary is enforced by the
 * API rather than by the web app hiding things.
 *
 * The assertions are deliberately positive as well as negative: proving another
 * user's notebook is absent means nothing unless the same test also proves the
 * owner can see it, otherwise a route that returns nothing to everybody would
 * pass.
 */
describe("cross user isolation", () => {
  it("refuses every data route without a session", async () => {
    for (const call of [
      request(app).get("/api/notebooks"),
      request(app).post("/api/notebooks").send({ name: "Nope" }),
    ]) {
      const response = await call;
      expect(response.status).toBe(401);
      expect((response.body as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
    }
  });

  it("lists only the signing in user's own notebooks", async () => {
    const alice = await signedIn(app, "alice@example.com");
    const bob = await signedIn(app, "bob@example.com");

    await alice.post("/api/notebooks").send({ name: "Alice's notebook" }).expect(201);
    await bob.post("/api/notebooks").send({ name: "Bob's notebook" }).expect(201);

    const forAlice = await alice.get("/api/notebooks").expect(200);
    const names = (forAlice.body as { data: NotebookListItemDto[] }).data.map((row) => row.name);

    // Positive and negative together: hers is present, his is not.
    expect(names).toContain("Alice's notebook");
    expect(names).not.toContain("Bob's notebook");
  });

  it("answers 404, not 403, for a notebook belonging to someone else", async () => {
    const alice = await signedIn(app, "alice@example.com");
    const bob = await signedIn(app, "bob@example.com");

    const created = await alice.post("/api/notebooks").send({ name: "Private" }).expect(201);
    const id = (created.body as { data: NotebookDto }).data.id;

    // The owner can reach it, which is what makes the refusal below meaningful.
    await alice.get(`/api/notebooks/${id}`).expect(200);

    // 404 rather than 403: a 403 would confirm the id names something real.
    await bob.get(`/api/notebooks/${id}`).expect(404);
    await bob.get(`/api/notebooks/${id}/sources`).expect(404);
    await bob.get(`/api/notebooks/${id}/chats`).expect(404);
  });

  it("does not let another user rename or delete a notebook", async () => {
    const alice = await signedIn(app, "alice@example.com");
    const bob = await signedIn(app, "bob@example.com");

    const created = await alice.post("/api/notebooks").send({ name: "Private" }).expect(201);
    const id = (created.body as { data: NotebookDto }).data.id;

    await bob.patch(`/api/notebooks/${id}`).send({ name: "Taken over" }).expect(404);
    await bob.delete(`/api/notebooks/${id}`).expect(404);

    // The refusal has to have actually protected the row, not merely reported a
    // 404 on the way out.
    const [row] = await db.select().from(notebooks).where(eq(notebooks.id, id)).limit(1);
    expect(row?.name).toBe("Private");
  });

  it("removes a user's notebooks when the user is deleted", async () => {
    const alice = await signedIn(app, "alice@example.com");
    const created = await alice.post("/api/notebooks").send({ name: "Private" }).expect(201);
    const id = (created.body as { data: NotebookDto }).data.id;

    const [before] = await db.select().from(notebooks).where(eq(notebooks.id, id)).limit(1);
    expect(before).toBeDefined();

    // The cascade is declared on the foreign key, so deleting the owner has to
    // take the notebook with it rather than leaving an unreachable row.
    await db.delete(users).where(eq(users.id, before?.userId ?? ""));

    const [after] = await db.select().from(notebooks).where(eq(notebooks.id, id)).limit(1);
    expect(after).toBeUndefined();
  });
});
