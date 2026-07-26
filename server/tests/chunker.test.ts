import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chunkBlocks,
  chunkProse,
  chunkTimed,
  countTokens,
  defaultChunkOptions,
} from "@/services/rag/chunker";
import { pdfExtractor } from "@/ingestion/extractors/pdf.extractor";
import { vttExtractor } from "@/ingestion/extractors/vtt.extractor";
import type { Block } from "@/ingestion/extractors/types";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name));

const input = (bytes: Buffer) => ({
  sourceId: "s",
  notebookId: "n",
  originalUrl: null,
  title: "fixture",
  bytes,
});

const options = defaultChunkOptions;

const proseBlock = (text: string, page: number): Block => ({
  text,
  locator: { kind: "pdf", page },
});

/** Deterministic filler so a block can be pushed over the token target. */
function words(count: number): string {
  const pool = "consensus replication partition tolerance latency quorum".split(" ");
  return Array.from({ length: count }, (_v, index) => pool[index % pool.length]).join(" ");
}

describe("prose chunker", () => {
  it("never exceeds the token ceiling", async () => {
    const blocks = Array.from({ length: 30 }, (_v, index) => proseBlock(words(400), index + 1));
    const chunks = await chunkProse(blocks, options);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // The overlap is carried on top of the target, so the ceiling is target
      // plus overlap, not target.
      expect(chunk.tokenCount).toBeLessThanOrEqual(options.targetTokens + options.overlapTokens);
    }
  });

  it("keeps chunkIndex contiguous from zero", async () => {
    const blocks = Array.from({ length: 20 }, (_v, index) => proseBlock(words(350), index + 1));
    const chunks = await chunkProse(blocks, options);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_c, index) => index));
  });

  it("carries the page of the block a chunk starts on, and pages never go backwards", async () => {
    const blocks = Array.from({ length: 24 }, (_v, index) => proseBlock(words(300), index + 1));
    const chunks = await chunkProse(blocks, options);

    let previousPage = 0;
    for (const chunk of chunks) {
      if (chunk.locator.kind !== "pdf") continue;
      expect(chunk.locator.page).toBeGreaterThanOrEqual(previousPage);
      previousPage = chunk.locator.page;
    }
  });

  it("never carries one page's text into a chunk labelled with another", async () => {
    // The bug this guards against was invisible in the locators and obvious in
    // the text: the page rule stopped the blocks merging, and the overlap
    // carried the previous page's words across anyway. Every citation after
    // the first then quoted one page while opening another.
    const pages = [
      proseBlock("Alpha content about consensus and quorums.", 1),
      proseBlock("Bravo content about raft and elections.", 2),
      proseBlock("Charlie content about sharding and keys.", 3),
    ];

    const chunks = await chunkProse(pages, options);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.text).toContain("Alpha");
    expect(chunks[0]?.text).not.toContain("Bravo");

    expect(chunks[1]?.text).toContain("Bravo");
    expect(chunks[1]?.text).not.toContain("Alpha");

    expect(chunks[2]?.text).toContain("Charlie");
    expect(chunks[2]?.text).not.toContain("Bravo");

    // And the locator each one claims is the page its text actually came from.
    expect(chunks.map((chunk) => (chunk.locator.kind === "pdf" ? chunk.locator.page : 0))).toEqual([
      1, 2, 3,
    ]);
  });

  it("splits a single block that is already larger than the target", async () => {
    const chunks = await chunkProse([proseBlock(words(3000), 7)], options);

    expect(chunks.length).toBeGreaterThan(2);
    // Splitting a page does not move it: every piece still cites page 7.
    for (const chunk of chunks) {
      expect(chunk.locator).toEqual({ kind: "pdf", page: 7 });
    }
  });

  it("merges a chunk below the minimum into its neighbour, per FR-3.4", async () => {
    const chunks = await chunkProse(
      [proseBlock(words(600), 1), proseBlock(words(600), 1), proseBlock("Appendix", 1)],
      options,
    );

    // The stray heading must not survive as its own retrievable chunk.
    expect(chunks.every((chunk) => chunk.tokenCount >= options.minTokens)).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("Appendix"))).toBe(true);
  });

  it("spans the character range of every block it contains", async () => {
    const blocks: Block[] = [
      { text: "First paragraph.", locator: { kind: "text", startChar: 0, endChar: 16 } },
      { text: "Second paragraph.", locator: { kind: "text", startChar: 18, endChar: 35 } },
    ];

    const chunks = await chunkProse(blocks, options);

    // Both paragraphs fit in one chunk, so the range must cover both of them.
    // Claiming only the first would highlight half of what was cited.
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.locator).toEqual({ kind: "text", startChar: 0, endChar: 35 });
  });
});

describe("timed chunker", () => {
  it("produces ranges that move forward and cover the recording", async () => {
    const extracted = await vttExtractor.extract(input(fixture("lecture.vtt")));
    const chunks = chunkTimed(extracted.blocks, options);

    expect(chunks.length).toBeGreaterThan(3);

    let previousStart = -1;
    for (const chunk of chunks) {
      if (chunk.locator.kind !== "timed") continue;
      expect(chunk.locator.endSec).toBeGreaterThan(chunk.locator.startSec);
      expect(chunk.locator.startSec).toBeGreaterThan(previousStart);
      previousStart = chunk.locator.startSec;
    }
  });

  it("aims for 60 to 90 seconds of speech per chunk", async () => {
    const extracted = await vttExtractor.extract(input(fixture("lecture.vtt")));
    const chunks = chunkTimed(extracted.blocks, options);

    const spans = chunks
      .map((chunk) =>
        chunk.locator.kind === "timed" ? chunk.locator.endSec - chunk.locator.startSec : 0,
      )
      .filter((span) => span > 0);

    const median = [...spans].sort((a, b) => a - b)[Math.floor(spans.length / 2)] ?? 0;
    expect(median).toBeGreaterThanOrEqual(45);
    expect(median).toBeLessThanOrEqual(120);
  });

  it("overlaps by one cue so a sentence on the boundary is findable from both sides", () => {
    const cues: Block[] = Array.from({ length: 40 }, (_v, index) => ({
      text: `Cue number ${index} carrying enough words to matter for the token count.`,
      locator: { kind: "timed", startSec: index * 5, endSec: index * 5 + 5 },
    }));

    const chunks = chunkTimed(cues, options);
    expect(chunks.length).toBeGreaterThan(1);

    for (let index = 1; index < chunks.length; index += 1) {
      const previous = chunks[index - 1];
      const current = chunks[index];
      if (previous?.locator.kind !== "timed" || current?.locator.kind !== "timed") continue;

      // The next chunk starts at or before the previous one ended, which is the
      // shared cue.
      expect(current.locator.startSec).toBeLessThanOrEqual(previous.locator.endSec);
    }
  });

  it("never exceeds the token ceiling even with dense speech", () => {
    const cues: Block[] = Array.from({ length: 200 }, (_v, index) => ({
      text: words(60),
      locator: { kind: "timed", startSec: index * 2, endSec: index * 2 + 2 },
    }));

    for (const chunk of chunkTimed(cues, options)) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(options.targetTokens + options.overlapTokens);
    }
  });
});

describe("chunkBlocks routing", () => {
  it("sends a real PDF through the prose path, never spanning pages", async () => {
    const extracted = await pdfExtractor.extract(input(fixture("distributed-systems.pdf")));
    const chunks = await chunkBlocks("PDF", extracted.blocks);

    // A chunk never spans pages, so the page a citation opens is the page the
    // text is actually on.
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.locator.kind === "pdf")).toBe(true);

    const sharding = chunks.find((chunk) => chunk.text.includes("Sharding partitions data"));
    expect(sharding?.locator).toEqual({ kind: "pdf", page: 3 });

    const raft = chunks.find((chunk) => chunk.text.includes("Raft decomposes consensus"));
    expect(raft?.locator).toEqual({ kind: "pdf", page: 2 });
  });

  it("sends VTT through the timed path", async () => {
    const extracted = await vttExtractor.extract(input(fixture("lecture.vtt")));
    const chunks = await chunkBlocks("VTT", extracted.blocks);
    expect(chunks.every((chunk) => chunk.locator.kind === "timed")).toBe(true);
  });

  it("counts tokens with a real tokenizer rather than characters", () => {
    // 1 token is roughly 4 characters of English, so a character count would be
    // out by about 4x and the target would mean nothing.
    const text = words(100);
    expect(countTokens(text)).toBeLessThan(text.length / 2);
    expect(countTokens("")).toBe(0);
  });
});
