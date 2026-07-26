import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "@/app";
import type { NotebookDto, SourceDto } from "@/types/api";
import { signedIn } from "./auth-helper";

// The queue client is exercised elsewhere. Here the assertion is that the API
// enqueues exactly once per created source and returns without waiting.
const enqueued: { name: string; sourceId: string }[] = [];

vi.mock("@/queues", () => ({
  enqueueIngest: vi.fn((data: { sourceId: string }) => {
    enqueued.push({ name: "ingest-source", sourceId: data.sourceId });
    return Promise.resolve({ id: "1" });
  }),
  enqueueReindex: vi.fn((data: { sourceId: string }) => {
    enqueued.push({ name: "reindex-source", sourceId: data.sourceId });
    return Promise.resolve({ id: "2" });
  }),
  enqueuePurge: vi.fn((data: { sourceId: string }) => {
    enqueued.push({ name: "purge-source", sourceId: data.sourceId });
    return Promise.resolve({ id: "3" });
  }),
  enqueueAnswer: vi.fn(() => Promise.resolve({ id: "4" })),
  closeQueues: vi.fn(() => Promise.resolve()),
  allQueues: {},
  roadmapQueue: { add: vi.fn(() => Promise.resolve({ id: "5" })) },
  podcastQueue: { add: vi.fn(() => Promise.resolve({ id: "6" })) },
  QUEUE_NAMES: {
    chat: "chat",
    ingest: "ingest",
    cleanup: "cleanup",
    roadmap: "roadmap",
    podcast: "podcast",
  },
  connection: {},
}));

const app = createApp();

// Every data route needs a session; the reset truncates users, so each test
// signs up its own account.
let agent: Awaited<ReturnType<typeof signedIn>>;

beforeEach(async () => {
  agent = await signedIn(app);
});
let notebookId: string;

const PDF_BYTES = Buffer.from("%PDF-1.4\n%fake pdf for upload validation\n%%EOF\n");

beforeAll(() => {
  vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

async function newNotebook(): Promise<string> {
  const response = await agent.post("/api/notebooks").send({ name: "Sources" });
  return (response.body as { data: NotebookDto }).data.id;
}

beforeEach(async () => {
  enqueued.length = 0;
  notebookId = await newNotebook();
});

function post(path: string) {
  return agent.post(`/api/notebooks/${notebookId}/sources${path}`);
}

describe("POST /sources/pdf", () => {
  it("returns a QUEUED row quickly and enqueues one ingest job", async () => {
    const startedAt = Date.now();
    const response = await post("/pdf").attach("files", PDF_BYTES, "paper.pdf");
    const elapsed = Date.now() - startedAt;

    expect(response.status).toBe(201);
    const created = (response.body as { data: SourceDto[] }).data;

    expect(created).toHaveLength(1);
    expect(created[0]?.status).toBe("QUEUED");
    expect(created[0]?.title).toBe("paper");
    expect(enqueued).toEqual([{ name: "ingest-source", sourceId: created[0]?.id }]);

    // The requirement is under 500ms; the point is that nothing is parsed or
    // embedded before responding.
    expect(elapsed).toBeLessThan(500);
  });

  it("accepts several files in one action, per FR-2.1", async () => {
    const response = await post("/pdf")
      .attach("files", PDF_BYTES, "one.pdf")
      .attach("files", Buffer.from("%PDF-1.4\ntwo\n%%EOF"), "two.pdf");

    expect(response.status).toBe(201);
    expect((response.body as { data: SourceDto[] }).data).toHaveLength(2);
    expect(enqueued).toHaveLength(2);
  });

  it("rejects a wrong MIME type with a readable reason", async () => {
    const response = await post("/pdf").attach("files", Buffer.from("not a pdf"), "notes.exe");

    expect(response.status).toBe(400);
    expect((response.body as { error: { message: string } }).error.message).toMatch(/PDF/);
    expect(enqueued).toHaveLength(0);
  });

  it("rejects an oversized file with 413", async () => {
    // One byte over the configured cap.
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1, 0);
    const response = await post("/pdf").attach("files", oversized, "huge.pdf");

    expect(response.status).toBe(413);
    expect((response.body as { error: { code: string } }).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(enqueued).toHaveLength(0);
  });

  it("400s when no file is attached", async () => {
    expect((await post("/pdf")).status).toBe(400);
  });

  it("rejects the same file twice in one notebook, per FR-2.15", async () => {
    await post("/pdf").attach("files", PDF_BYTES, "paper.pdf");
    const second = await post("/pdf").attach("files", PDF_BYTES, "paper-copy.pdf");

    expect(second.status).toBe(409);
    expect((second.body as { error: { message: string } }).error.message).toMatch(/already/i);
  });

  it("allows the same file in a different notebook", async () => {
    await post("/pdf").attach("files", PDF_BYTES, "paper.pdf");

    const other = await newNotebook();
    const response = await agent
      .post(`/api/notebooks/${other}/sources/pdf`)
      .attach("files", PDF_BYTES, "paper.pdf");

    expect(response.status).toBe(201);
  });
});

describe("POST /sources/text", () => {
  it("creates a source from pasted text", async () => {
    const response = await post("/text").send({ title: "Notes", content: "Some research notes." });

    expect(response.status).toBe(201);
    const created = (response.body as { data: SourceDto }).data;
    expect(created.title).toBe("Notes");
    expect(created.status).toBe("QUEUED");
  });

  it("rejects empty content", async () => {
    expect((await post("/text").send({ content: "   " })).status).toBe(400);
  });
});

describe("POST /sources/web", () => {
  it("rejects a private IP, per NFR-10", async () => {
    const response = await post("/web").send({ url: "http://192.168.1.1/admin" });

    expect(response.status).toBe(400);
    expect((response.body as { error: { message: string } }).error.message).toMatch(
      /private or internal/i,
    );
  });

  it("rejects loopback", async () => {
    expect((await post("/web").send({ url: "http://127.0.0.1:6333/collections" })).status).toBe(
      400,
    );
  });

  it("rejects link local, the cloud metadata address", async () => {
    expect(
      (await post("/web").send({ url: "http://169.254.169.254/latest/meta-data/" })).status,
    ).toBe(400);
  });

  it("rejects a non http protocol", async () => {
    expect((await post("/web").send({ url: "file:///etc/passwd" })).status).toBe(400);
  });

  it("rejects a hostname that resolves to loopback", async () => {
    expect((await post("/web").send({ url: "http://localhost:4000/api/health" })).status).toBe(400);
  });
});

describe("POST /sources/youtube", () => {
  it("accepts a watch URL", async () => {
    const response = await post("/youtube").send({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(response.status).toBe(201);
    expect((response.body as { data: SourceDto }).data.type).toBe("YOUTUBE");
  });

  it("accepts a short URL", async () => {
    expect((await post("/youtube").send({ url: "https://youtu.be/dQw4w9WgXcQ" })).status).toBe(201);
  });

  it("rejects a URL that is not YouTube", async () => {
    const response = await post("/youtube").send({ url: "https://vimeo.com/12345" });

    expect(response.status).toBe(400);
    expect((response.body as { error: { message: string } }).error.message).toMatch(/YouTube/);
  });
});

describe("source management", () => {
  async function createOne(): Promise<SourceDto> {
    const response = await post("/text").send({ content: "content for management tests" });
    return (response.body as { data: SourceDto }).data;
  }

  it("lists sources for the notebook", async () => {
    await createOne();
    const response = await agent.get(`/api/notebooks/${notebookId}/sources`);

    expect(response.status).toBe(200);
    expect((response.body as { data: SourceDto[] }).data).toHaveLength(1);
  });

  it("renames a source", async () => {
    const source = await createOne();
    const response = await agent
      .patch(`/api/notebooks/${notebookId}/sources/${source.id}`)
      .send({ title: "Renamed" });

    expect(response.status).toBe(200);
    expect((response.body as { data: SourceDto }).data.title).toBe("Renamed");
  });

  it("toggles selection, per FR-2.14", async () => {
    const source = await createOne();
    expect(source.selected).toBe(true);

    const response = await agent
      .patch(`/api/notebooks/${notebookId}/sources/${source.id}`)
      .send({ selected: false });

    expect((response.body as { data: SourceDto }).data.selected).toBe(false);
  });

  it("re-index enqueues without re-uploading", async () => {
    const source = await createOne();
    enqueued.length = 0;

    const response = await agent.post(`/api/notebooks/${notebookId}/sources/${source.id}/reindex`);

    expect(response.status).toBe(202);
    expect(enqueued).toEqual([{ name: "reindex-source", sourceId: source.id }]);
  });

  it("delete enqueues a purge and removes the row", async () => {
    const source = await createOne();
    enqueued.length = 0;

    expect((await agent.delete(`/api/notebooks/${notebookId}/sources/${source.id}`)).status).toBe(
      204,
    );
    expect(enqueued).toEqual([{ name: "purge-source", sourceId: source.id }]);

    const list = await agent.get(`/api/notebooks/${notebookId}/sources`);
    expect((list.body as { data: SourceDto[] }).data).toHaveLength(0);
  });

  it("404s a source requested under the wrong notebook", async () => {
    const source = await createOne();
    const other = await newNotebook();

    expect((await agent.get(`/api/notebooks/${other}/sources/${source.id}`)).status).toBe(404);
  });

  it("404s a delete attempted from the wrong notebook", async () => {
    const source = await createOne();
    const other = await newNotebook();

    expect((await agent.delete(`/api/notebooks/${other}/sources/${source.id}`)).status).toBe(404);
  });
});
