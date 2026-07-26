import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { notebooks, sources } from "@/db/schema";
import { putFile } from "@/db/repositories/source-file.repository";
import { runIngestion } from "@/ingestion/pipeline";
import { ensureCollection } from "@/vector/qdrant.repository";
import { deleteByNotebook } from "@/vector/chunk.vector-repository";
import { retrieveOnce, denseSearch, keywordSearch } from "@/services/rag/retrieval";

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

/**
 * Two notebooks holding deliberately near identical content. If the filter is
 * ever dropped, these tests fail loudly rather than the leak surfacing as a
 * confusing answer months later.
 */
const SHARED_TEXT = `
Consensus in distributed systems requires a quorum of nodes to agree.

Raft decomposes consensus into leader election, log replication and safety.

Sharding partitions data across nodes using a partition key.
`.trim();

let alphaId = "";
let betaId = "";

beforeEach(async () => {
  await ensureCollection();

  const [alpha] = await db.insert(notebooks).values({ name: "Alpha" }).returning();
  const [beta] = await db.insert(notebooks).values({ name: "Beta" }).returning();
  alphaId = alpha?.id ?? "";
  betaId = beta?.id ?? "";

  for (const [notebookId, marker] of [
    [alphaId, "alpha"],
    [betaId, "beta"],
  ] as const) {
    const [source] = await db
      .insert(sources)
      .values({
        notebookId,
        type: "TEXT",
        title: `${marker} notes`,
        contentHash: `${marker}-${Date.now()}`,
      })
      .returning();

    await putFile({
      sourceId: source?.id ?? "",
      kind: "original",
      filename: "notes.txt",
      mimeType: "text/plain",
      // Near identical, differing only by a marker, so a leak is unambiguous.
      bytes: Buffer.from(`${SHARED_TEXT}\n\nThis paragraph belongs to ${marker}.`),
    });

    await runIngestion(source?.id ?? "");
  }
});

afterAll(async () => {
  await Promise.all([deleteByNotebook(alphaId), deleteByNotebook(betaId)]);
  await db.delete(notebooks);
});

describe("notebook isolation", () => {
  it("dense search never returns another notebook's chunk", async () => {
    const list = await denseSearch(
      { label: "original", text: "consensus and quorum" },
      { notebookId: alphaId, sourceIds: [] },
    );

    expect(list.candidates.length).toBeGreaterThan(0);
    for (const candidate of list.candidates) {
      expect(candidate.text).not.toContain("belongs to beta");
    }
  });

  it("keyword search never returns another notebook's chunk", async () => {
    const list = await keywordSearch(
      { label: "original", text: "sharding partition key" },
      { notebookId: alphaId, sourceIds: [] },
    );

    for (const candidate of list.candidates) {
      expect(candidate.text).not.toContain("belongs to beta");
    }
  });

  it("keyword search finds this notebook's content, so the check above is not vacuous", async () => {
    const list = await keywordSearch(
      { label: "original", text: "sharding partition key" },
      { notebookId: alphaId, sourceIds: [] },
    );

    expect(list.candidates.length).toBeGreaterThan(0);
  });

  it("matches a natural language question, not only an exact term", async () => {
    // websearch_to_tsquery ANDs its terms, so an unmodified question requires
    // every word in one chunk and matches nothing. This is the regression that
    // made the keyword channel silently dead.
    const list = await keywordSearch(
      { label: "original", text: "what does this say about consensus and quorums" },
      { notebookId: alphaId, sourceIds: [] },
    );

    expect(list.candidates.length).toBeGreaterThan(0);
  });

  it("still treats a quoted phrase as a phrase", async () => {
    const phrase = await keywordSearch(
      { label: "original", text: '"leader election"' },
      { notebookId: alphaId, sourceIds: [] },
    );
    const nonsense = await keywordSearch(
      { label: "original", text: '"election leader replication"' },
      { notebookId: alphaId, sourceIds: [] },
    );

    // The real phrase appears; a scrambled one does not, so ORing the terms has
    // not cost precision where the user asked for it.
    expect(phrase.candidates.length).toBeGreaterThan(0);
    expect(nonsense.candidates).toHaveLength(0);
  });

  it("searching for the other notebook's marker returns nothing from it", async () => {
    const list = await keywordSearch(
      { label: "original", text: "beta" },
      { notebookId: alphaId, sourceIds: [] },
    );

    expect(list.candidates.filter((row) => row.text.includes("belongs to beta"))).toHaveLength(0);
  });

  it("holds through the whole pipeline, including generated variants", async () => {
    // Variants are the most likely place for a leak, because a HyDE passage or a
    // sub question is text the user never wrote. The filter sits below them.
    const result = await retrieveOnce({
      notebookId: alphaId,
      question: "what does this say about consensus and sharding",
    });

    expect(result.reranked.length).toBeGreaterThan(0);
    for (const candidate of result.reranked) {
      expect(candidate.text).not.toContain("belongs to beta");
    }
  });

  it("returns each notebook only its own content for the same question", async () => {
    const [alpha, beta] = await Promise.all([
      retrieveOnce({ notebookId: alphaId, question: "what belongs here" }),
      retrieveOnce({ notebookId: betaId, question: "what belongs here" }),
    ]);

    const alphaText = alpha.reranked.map((row) => row.text).join(" ");
    const betaText = beta.reranked.map((row) => row.text).join(" ");

    expect(alphaText).toContain("belongs to alpha");
    expect(alphaText).not.toContain("belongs to beta");
    expect(betaText).toContain("belongs to beta");
    expect(betaText).not.toContain("belongs to alpha");
  });
});
