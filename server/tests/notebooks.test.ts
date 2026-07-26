import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { db } from "@/db/client";
import { notebooks, sources } from "@/db/schema";
import type { NotebookDto, NotebookListItemDto } from "@/types/api";

const app = createApp();
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

async function createNotebook(name?: string): Promise<NotebookDto> {
  const response = await request(app)
    .post("/api/notebooks")
    .send(name === undefined ? {} : { name });

  expect(response.status).toBe(201);
  return (response.body as { data: NotebookDto }).data;
}

describe("POST /api/notebooks", () => {
  it("creates a notebook and returns the envelope", async () => {
    const notebook = await createNotebook("Distributed systems");

    expect(notebook.name).toBe("Distributed systems");
    expect(notebook.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(notebook.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("defaults an absent name, per FR-1.1", async () => {
    expect((await createNotebook()).name).toBe("Untitled notebook");
  });

  it("defaults a whitespace only name rather than storing it", async () => {
    expect((await createNotebook("   ")).name).toBe("Untitled notebook");
  });

  it("rejects a name over 80 characters with a field level detail", async () => {
    const response = await request(app)
      .post("/api/notebooks")
      .send({ name: "x".repeat(81) });

    expect(response.status).toBe(400);
    const body = response.body as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.details[0]?.path).toBe("name");
  });
});

describe("GET /api/notebooks", () => {
  it("returns an empty list rather than 404 when there are none", async () => {
    const response = await request(app).get("/api/notebooks");
    expect(response.status).toBe(200);
    expect((response.body as { data: unknown[] }).data).toEqual([]);
  });

  it("reports a source count per notebook, per FR-1.2", async () => {
    const withSources = await createNotebook("Has sources");
    const empty = await createNotebook("Empty");

    await db.insert(sources).values([
      { notebookId: withSources.id, type: "PDF", title: "a.pdf", contentHash: "hash-a" },
      { notebookId: withSources.id, type: "TEXT", title: "note", contentHash: "hash-b" },
    ]);

    const response = await request(app).get("/api/notebooks");
    const data = (response.body as { data: NotebookListItemDto[] }).data;

    expect(data.find((n) => n.id === withSources.id)?.sourceCount).toBe(2);
    expect(data.find((n) => n.id === empty.id)?.sourceCount).toBe(0);
  });
});

describe("GET /api/notebooks/:notebookId", () => {
  it("returns the notebook", async () => {
    const created = await createNotebook("Readable");
    const response = await request(app).get(`/api/notebooks/${created.id}`);

    expect(response.status).toBe(200);
    expect((response.body as { data: NotebookDto }).data.name).toBe("Readable");
  });

  it("404s for an id that does not exist", async () => {
    const response = await request(app).get(`/api/notebooks/${MISSING_ID}`);
    expect(response.status).toBe(404);
    expect((response.body as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("400s for an id that is not a uuid, rather than reaching the database", async () => {
    expect((await request(app).get("/api/notebooks/not-a-uuid")).status).toBe(400);
  });
});

describe("PATCH /api/notebooks/:notebookId", () => {
  it("renames and advances updatedAt", async () => {
    const created = await createNotebook("Before");
    const response = await request(app)
      .patch(`/api/notebooks/${created.id}`)
      .send({ name: "After" });

    expect(response.status).toBe(200);
    const updated = (response.body as { data: NotebookDto }).data;
    expect(updated.name).toBe("After");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );
  });

  it("rejects an empty name", async () => {
    const created = await createNotebook("Keep me");
    expect(
      (await request(app).patch(`/api/notebooks/${created.id}`).send({ name: "" })).status,
    ).toBe(400);
  });

  it("404s before validating the body, for a notebook that does not exist", async () => {
    expect(
      (await request(app).patch(`/api/notebooks/${MISSING_ID}`).send({ name: "Whatever" })).status,
    ).toBe(404);
  });
});

describe("DELETE /api/notebooks/:notebookId", () => {
  it("deletes and cascades to sources, per FR-1.4", async () => {
    const created = await createNotebook("Doomed");
    await db.insert(sources).values({
      notebookId: created.id,
      type: "PDF",
      title: "doomed.pdf",
      contentHash: "hash-doomed",
    });

    expect((await request(app).delete(`/api/notebooks/${created.id}`)).status).toBe(204);
    expect(await db.select().from(notebooks)).toHaveLength(0);
    expect(await db.select().from(sources)).toHaveLength(0);
  });

  it("404s when deleting twice", async () => {
    const created = await createNotebook("Once");
    await request(app).delete(`/api/notebooks/${created.id}`);
    expect((await request(app).delete(`/api/notebooks/${created.id}`)).status).toBe(404);
  });
});

describe("cross notebook access", () => {
  it("404s a source requested under the wrong notebook, rather than 200", async () => {
    const owner = await createNotebook("Owner");
    const other = await createNotebook("Other");

    const [source] = await db
      .insert(sources)
      .values({
        notebookId: owner.id,
        type: "PDF",
        title: "owned.pdf",
        contentHash: "hash-owned",
      })
      .returning();

    const response = await request(app).get(`/api/notebooks/${other.id}/sources/${source?.id}`);
    expect(response.status).toBe(404);
  });
});

describe("error envelope", () => {
  it("uses { error: { code, message } } for an unknown route", async () => {
    const response = await request(app).get("/api/nope");

    expect(response.status).toBe(404);
    const body = response.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(typeof body.error.message).toBe("string");
  });

  it("never returns a { data } key alongside an error", async () => {
    expect(await request(app).get(`/api/notebooks/${MISSING_ID}`)).not.toHaveProperty("body.data");
  });
});
