import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pdfExtractor } from "@/ingestion/extractors/pdf.extractor";
import { textExtractor } from "@/ingestion/extractors/text.extractor";
import { vttExtractor } from "@/ingestion/extractors/vtt.extractor";
import { createWebExtractor } from "@/ingestion/extractors/web.extractor";
import {
  createYoutubeExtractor,
  type YoutubeClient,
} from "@/ingestion/extractors/youtube.extractor";
import { ExtractionError, type ExtractorInput } from "@/ingestion/extractors/types";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name));

function inputFor(overrides: Partial<ExtractorInput> = {}): ExtractorInput {
  return {
    sourceId: "00000000-0000-0000-0000-000000000001",
    notebookId: "00000000-0000-0000-0000-000000000002",
    originalUrl: null,
    title: "fixture",
    ...overrides,
  };
}

describe("PDF extractor", () => {
  it("returns one block per page with 1 based page locators", async () => {
    const result = await pdfExtractor.extract(
      inputFor({ bytes: fixture("distributed-systems.pdf") }),
    );

    expect(result.blocks.length).toBe(3);
    expect(result.metadata.pageCount).toBe(3);
    expect(result.blocks[0]?.locator).toEqual({ kind: "pdf", page: 1 });
    expect(result.blocks[2]?.locator).toEqual({ kind: "pdf", page: 3 });

    // Content lands on the page it was written on, which is what a citation
    // depends on.
    expect(result.blocks[0]?.text).toMatch(/Consensus is the problem/);
    expect(result.blocks[1]?.text).toMatch(/Raft decomposes consensus/);
    expect(result.blocks[2]?.text).toMatch(/Sharding partitions data/);
  });

  it("fails a scanned document with the reason from the PRD", async () => {
    await expect(pdfExtractor.extract(inputFor({ bytes: fixture("scanned.pdf") }))).rejects.toThrow(
      /no extractable text layer, it looks like a scan/,
    );
  });

  it("fails a file that is not a PDF", async () => {
    await expect(
      pdfExtractor.extract(inputFor({ bytes: Buffer.from("this is not a pdf") })),
    ).rejects.toThrow(ExtractionError);
  });
});

describe("text extractor", () => {
  it("splits on paragraphs with offsets that index back into the text", async () => {
    const bytes = fixture("notes.md");
    const result = await textExtractor.extract(inputFor({ bytes }));

    expect(result.blocks.length).toBe(4);

    const normalised = bytes.toString("utf8").replace(/\r\n/g, "\n").trim();

    // Every locator must slice its own text back out, or a highlight lands in
    // the wrong place.
    for (const block of result.blocks) {
      if (block.locator.kind !== "text") continue;
      expect(normalised.slice(block.locator.startChar, block.locator.endChar)).toBe(block.text);
    }

    expect(result.blocks[0]?.text).toBe("# Research notes");
  });

  it("rejects an empty file", async () => {
    await expect(
      textExtractor.extract(inputFor({ bytes: Buffer.from("   \n\n  ") })),
    ).rejects.toThrow(/empty/);
  });
});

describe("VTT and SRT extractor", () => {
  it("reads a real VTT into timed blocks", async () => {
    const result = await vttExtractor.extract(inputFor({ bytes: fixture("lecture.vtt") }));

    expect(result.blocks.length).toBeGreaterThan(100);
    expect(result.metadata.cueCount).toBe(result.blocks.length);

    const first = result.blocks[0];
    const last = result.blocks[result.blocks.length - 1];

    expect(first?.locator.kind).toBe("timed");

    // Time runs forward and the reported duration matches the final cue.
    if (last?.locator.kind === "timed" && first?.locator.kind === "timed") {
      expect(last.locator.endSec).toBeGreaterThan(first.locator.startSec);
      expect(result.metadata.durationSec).toBe(Math.round(last.locator.endSec));
    }
  });

  it("reads a real SRT with the same shape", async () => {
    const result = await vttExtractor.extract(inputFor({ bytes: fixture("lecture.srt") }));
    expect(result.blocks.length).toBeGreaterThan(100);
    expect(result.blocks[0]?.locator.kind).toBe("timed");
  });

  it("lifts a WebVTT voice tag into a speaker label", async () => {
    const vtt = Buffer.from(
      "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Priya>The results are inconclusive.\n",
    );
    const result = await vttExtractor.extract(inputFor({ bytes: vtt }));

    expect(result.blocks[0]?.text).toBe("Priya: The results are inconclusive.");
    expect(result.metadata.author).toBe("Priya");
  });

  it("rejects a file that is not a transcript", async () => {
    await expect(
      vttExtractor.extract(inputFor({ bytes: Buffer.from("just some prose, not a transcript") })),
    ).rejects.toThrow(/could not be read as a VTT or SRT transcript/i);
  });
});

describe("web extractor", () => {
  const html = fixture("article.html").toString("utf8");
  const extractor = createWebExtractor(() =>
    Promise.resolve({ html, finalUrl: "https://example.com/sharding" }),
  );

  it("extracts article text with a heading path per block", async () => {
    const result = await extractor.extract(
      inputFor({ originalUrl: "https://example.com/sharding" }),
    );

    expect(result.title).toBe("Sharding strategies for growing datasets");
    expect(result.blocks.length).toBeGreaterThan(4);

    const text = result.blocks.map((block) => block.text).join(" ");
    expect(text).toMatch(/Hashing the key spreads rows evenly/);
    // Readability drops chrome, which is the whole point of using it.
    expect(text).not.toMatch(/Footer text that should not be extracted/);
    expect(text).not.toMatch(/Site header that is not article content/);

    const rebalancing = result.blocks.find((block) =>
      block.text.startsWith("Splitting a hot range"),
    );
    if (rebalancing?.locator.kind === "web") {
      expect(rebalancing.locator.headingPath).toContain("Rebalancing");
    }
  });

  it("captures the reader view for the viewer", async () => {
    const result = await extractor.extract(
      inputFor({ originalUrl: "https://example.com/sharding" }),
    );

    expect(result.captured?.mimeType).toBe("text/html");
    expect(result.captured?.bytes.toString("utf8")).toMatch(/Hash partitioning/);
  });

  it("falls back to cheerio when Readability finds no article", async () => {
    const bare = createWebExtractor(() =>
      Promise.resolve({
        html: "<html><body><div><p>A single stray paragraph with enough words to be worth keeping.</p></div></body></html>",
        finalUrl: "https://example.com/bare",
      }),
    );

    const result = await bare.extract(inputFor({ originalUrl: "https://example.com/bare" }));
    expect(result.blocks[0]?.text).toMatch(/single stray paragraph/);
  });

  it("surfaces a 403 as an actionable message", async () => {
    const blocked = createWebExtractor(() => {
      throw new ExtractionError(
        "The site returned 403 and refused the request. Try pasting the text as a Text source instead.",
      );
    });

    await expect(blocked.extract(inputFor({ originalUrl: "https://example.com" }))).rejects.toThrow(
      /returned 403/,
    );
  });

  it("fails a page with no readable text", async () => {
    const empty = createWebExtractor(() =>
      Promise.resolve({ html: "<html><body></body></html>", finalUrl: "https://example.com" }),
    );

    await expect(empty.extract(inputFor({ originalUrl: "https://example.com" }))).rejects.toThrow(
      /No readable article text/,
    );
  });
});

describe("YouTube extractor", () => {
  const api: YoutubeClient = {
    fetchTranscript: () =>
      Promise.resolve({
        title: "How Raft works",
        author: "Some Channel",
        durationSec: 630,
        cues: [
          { text: "Raft is a consensus algorithm.", startSec: 0, endSec: 4.2 },
          { text: "It elects a leader per term.", startSec: 4.2, endSec: 9.6 },
        ],
      }),
    fetchPlaylist: () =>
      Promise.resolve({ title: "Distributed systems", videoIds: ["aaaaaaaaaaa", "bbbbbbbbbbb"] }),
  };

  it("turns cues into timed blocks", async () => {
    const result = await createYoutubeExtractor(api).extract(
      inputFor({ originalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    );

    expect(result.title).toBe("How Raft works");
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]?.locator).toEqual({ kind: "timed", startSec: 0, endSec: 4.2 });
    expect(result.metadata.videoId).toBe("dQw4w9WgXcQ");
  });

  it("expands a playlist into sibling sources, per FR-2.5", async () => {
    const result = await createYoutubeExtractor(api).extract(
      inputFor({ originalUrl: "https://www.youtube.com/playlist?list=PLabcdefghijkl" }),
    );

    expect(result.blocks).toHaveLength(0);
    expect(result.siblings).toHaveLength(2);
    // Distinct hashes, or the second video would be rejected as a duplicate.
    expect(result.siblings?.[0]?.contentHash).not.toBe(result.siblings?.[1]?.contentHash);
  });

  it("fails a captionless video with the reason from the PRD", async () => {
    const captionless = createYoutubeExtractor({
      ...api,
      fetchTranscript: () => {
        throw new ExtractionError(
          "This video has captions disabled. Upload a VTT or SRT transcript for it instead.",
        );
      },
    });

    await expect(
      captionless.extract(inputFor({ originalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })),
    ).rejects.toThrow(/captions disabled/);
  });
});
