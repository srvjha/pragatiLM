import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { join } from "node:path";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { notebooks, sources } from "@/db/schema";
import { putFile } from "@/db/repositories/source-file.repository";
import { findSourceById } from "@/db/repositories/source.repository";
import { countChunksForSource, listChunksForSource } from "@/db/repositories/chunk.repository";
import { runIngestion } from "@/ingestion/pipeline";
import { ensureCollection } from "@/vector/qdrant.repository";
import {
  countBySource,
  deleteBySource,
  countByNotebook,
  deleteByNotebook,
} from "@/vector/chunk.vector-repository";
import { reconcileOrphans } from "@/workers/cleanup.worker";
import { TEST_USER_ID } from "./setup";

vi.mock("@/queues", () => ({
  enqueueIngest: vi.fn(() => Promise.resolve({ id: "1" })),
  enqueueReindex: vi.fn(() => Promise.resolve({ id: "2" })),
  enqueuePurge: vi.fn(() => Promise.resolve({ id: "3" })),
  enqueueAnswer: vi.fn(() => Promise.resolve({ id: "4" })),
  closeQueues: vi.fn(() => Promise.resolve()),
  QUEUE_NAMES: {
    chat: "chat",
    ingest: "ingest",
    cleanup: "cleanup",
    roadmap: "roadmap",
    podcast: "podcast",
  },
  connection: {},
}));

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name));

let notebookId: string;

beforeAll(async () => {
  await ensureCollection();
});

beforeEach(async () => {
  const [notebook] = await db
    .insert(notebooks)
    .values({ name: "Ingestion", userId: TEST_USER_ID })
    .returning();
  notebookId = notebook?.id ?? "";
});

afterAll(async () => {
  await deleteByNotebook(notebookId);
});

async function addSource(
  type: "PDF" | "TEXT" | "VTT",
  filename: string,
  bytes: Buffer,
): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ notebookId, type, title: filename, contentHash: `${type}-${Math.random()}` })
    .returning();

  const id = source?.id ?? "";
  await putFile({
    sourceId: id,
    kind: "original",
    filename,
    mimeType: "application/octet-stream",
    bytes,
  });
  return id;
}

describe("full ingestion pipeline", () => {
  it("takes a real PDF to READY with vectors matching chunks", async () => {
    const sourceId = await addSource("PDF", "handbook.pdf", fixture("handbook-20p.pdf"));

    const result = await runIngestion(sourceId);
    const source = await findSourceById(sourceId);

    expect(source?.status).toBe("READY");
    expect(source?.progress).toBe(100);
    expect(source?.indexedAt).not.toBeNull();
    expect(source?.errorMessage).toBeNull();

    // The count in Qdrant matching the count in Postgres is the whole assertion:
    // it means nothing was dropped and nothing was written twice.
    const chunkCount = await countChunksForSource(sourceId);
    expect(chunkCount).toBe(result.chunkCount);
    expect(await countBySource(sourceId)).toBe(chunkCount);

    await deleteBySource(sourceId);
  });

  it("stores the metadata the extractor produced", async () => {
    // Every extractor has always returned metadata and the pipeline never
    // wrote it, so the column held `{}` for every source in the product. The
    // symptom was two features quietly not working: the PDF viewer sized
    // itself from a page count of zero, and a YouTube source rendered as a
    // transcript with no video, because the id needed to embed the player was
    // computed at ingestion and thrown away.
    const sourceId = await addSource("PDF", "handbook.pdf", fixture("handbook-20p.pdf"));
    await runIngestion(sourceId);

    const source = await findSourceById(sourceId);
    expect(source?.metadata.pageCount).toBe(20);

    await deleteBySource(sourceId);
  });

  it("stamps the embedding model and dimension on every chunk, per FR-3.6", async () => {
    const sourceId = await addSource("TEXT", "notes.md", fixture("notes.md"));
    await runIngestion(sourceId);

    const rows = await listChunksForSource(sourceId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.embeddingModel).toBe("fake-deterministic");
      expect(row.embeddingDim).toBe(1536);
    }

    await deleteBySource(sourceId);
  });

  it("indexes a real transcript with timed locators intact", async () => {
    const sourceId = await addSource("VTT", "lecture.vtt", fixture("lecture.vtt"));
    await runIngestion(sourceId);

    const rows = await listChunksForSource(sourceId);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((row) => row.locator.kind === "timed")).toBe(true);
    expect(await countBySource(sourceId)).toBe(rows.length);

    await deleteBySource(sourceId);
  });

  it("deleting a source drops its point count to zero", async () => {
    const sourceId = await addSource("TEXT", "notes.md", fixture("notes.md"));
    await runIngestion(sourceId);

    expect(await countBySource(sourceId)).toBeGreaterThan(0);
    await deleteBySource(sourceId);
    expect(await countBySource(sourceId)).toBe(0);
  });

  it("re-indexing replaces the set with no duplicates left behind", async () => {
    const sourceId = await addSource("PDF", "handbook.pdf", fixture("handbook-20p.pdf"));
    await runIngestion(sourceId);

    const before = await countChunksForSource(sourceId);
    expect(await countBySource(sourceId)).toBe(before);

    await runIngestion(sourceId, true);

    // Same input, same chunk count, and crucially not double.
    expect(await countChunksForSource(sourceId)).toBe(before);
    expect(await countBySource(sourceId)).toBe(before);

    await deleteBySource(sourceId);
  });

  it("leaves nothing queryable when embedding fails partway", async () => {
    const sourceId = await addSource("TEXT", "notes.md", fixture("notes.md"));
    const providers = await import("@/providers/embedding");

    providers.setEmbeddingProvider({
      model: "broken",
      dimensions: 1536,
      embedDocuments: () => Promise.reject(new Error("provider exploded")),
      embedQuery: () => Promise.reject(new Error("provider exploded")),
    });

    await expect(runIngestion(sourceId)).rejects.toThrow(/provider exploded/);

    // FR-3.8: no vectors, so a half indexed source cannot leak into an answer.
    expect(await countBySource(sourceId)).toBe(0);
    expect((await findSourceById(sourceId))?.status).not.toBe("READY");

    providers.setEmbeddingProvider(null);
  });

  it("reconciliation removes vectors whose source no longer exists", async () => {
    const sourceId = await addSource("TEXT", "notes.md", fixture("notes.md"));
    await runIngestion(sourceId);
    expect(await countBySource(sourceId)).toBeGreaterThan(0);

    // Delete the row without letting the purge job run, which is what a worker
    // being down at the wrong moment looks like.
    await db.delete(sources).where(eq(sources.id, sourceId));
    expect(await countBySource(sourceId)).toBeGreaterThan(0);

    expect(await reconcileOrphans()).toBeGreaterThanOrEqual(1);
    expect(await countBySource(sourceId)).toBe(0);
  });

  it("keeps notebooks isolated in the vector store", async () => {
    const sourceId = await addSource("TEXT", "notes.md", fixture("notes.md"));
    await runIngestion(sourceId);

    const [other] = await db
      .insert(notebooks)
      .values({ name: "Other", userId: TEST_USER_ID })
      .returning();
    expect(await countByNotebook(other?.id ?? "")).toBe(0);
    expect(await countByNotebook(notebookId)).toBeGreaterThan(0);

    await deleteBySource(sourceId);
  });
});
