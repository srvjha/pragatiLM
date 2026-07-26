import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { countTokens, tailTokens } from "./tokens";
import { canShareChunk, spanLocator } from "./locator";
import type { Chunk, ChunkOptions } from "./types";
import type { Block } from "@/ingestion/extractors/types";

/**
 * PDF, text and web. Blocks accumulate until the token target is reached, so a
 * chunk stops on a paragraph boundary wherever possible.
 *
 * A chunk also stops whenever the next block would make its locator a lie, which
 * for a PDF means a page boundary. That costs some chunk size on documents with
 * short pages and buys a citation that opens on the right page every time.
 *
 * The splitter is only reached for a block already larger than the target, which
 * is where recursive splitting on paragraph then sentence boundaries earns its
 * keep.
 */
export async function chunkProse(blocks: Block[], options: ChunkOptions): Promise<Chunk[]> {
  const pieces = await explodeOversizedBlocks(blocks, options);
  const chunks: Chunk[] = [];

  let current: Block[] = [];
  let currentTokens = 0;
  let carry = "";

  const flush = () => {
    if (current.length === 0) return;

    const body = current.map((block) => block.text).join("\n\n");
    const text = carry ? `${carry}\n\n${body}` : body;

    chunks.push({
      chunkIndex: chunks.length,
      text,
      tokenCount: countTokens(text),
      locator: spanLocator(current),
    });

    // The carry is the tail of this chunk's own content, so the next chunk opens
    // with text a reader has just seen.
    carry = tailTokens(body, options.overlapTokens);
    current = [];
    currentTokens = 0;
  };

  for (const piece of pieces) {
    const previous = current[current.length - 1];
    const wouldExceed =
      currentTokens > 0 && currentTokens + countTokens(piece.text) > options.targetTokens;
    const wouldBreakLocator =
      previous !== undefined && !canShareChunk(previous.locator, piece.locator);

    if (wouldExceed || wouldBreakLocator) {
      flush();

      // The overlap must not cross the boundary that just forced the flush.
      //
      // Carrying the tail of page 1 into the chunk for page 2 puts page 1's
      // words inside a chunk whose locator says page 2, which is precisely the
      // lie canShareChunk exists to prevent; the page rule stopped the blocks
      // merging and the carry walked the text across anyway. On a document with
      // short pages the carry is the whole previous page, so the citation
      // quotes one page while opening another.
      //
      // Overlap only buys reading continuity, and there is none across a page
      // break, so dropping it costs nothing worth keeping.
      if (wouldBreakLocator) carry = "";
    }

    current.push(piece);
    currentTokens += countTokens(piece.text);
  }

  flush();

  return mergeSmallChunks(chunks, options);
}

async function explodeOversizedBlocks(blocks: Block[], options: ChunkOptions): Promise<Block[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.targetTokens,
    chunkOverlap: 0,
    lengthFunction: countTokens,
    separators: ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""],
  });

  const pieces: Block[] = [];

  for (const block of blocks) {
    if (countTokens(block.text) <= options.targetTokens) {
      pieces.push(block);
      continue;
    }

    // Each piece keeps the parent's locator: a page is still that page after
    // being split in two.
    for (const text of await splitter.splitText(block.text)) {
      if (text.trim().length > 0) pieces.push({ text, locator: block.locator });
    }
  }

  return pieces;
}

/**
 * FR-3.4. A stray heading or a one line page becomes retrieval noise on its own,
 * so anything under the floor is folded into a neighbour, but only where the
 * locator survives the merge. A short page that cannot merge is kept as is:
 * a slightly noisy chunk is better than a citation pointing at the wrong page.
 */
export function mergeSmallChunks(chunks: Chunk[], options: ChunkOptions): Chunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: Chunk[] = [];

  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      chunk.tokenCount < options.minTokens &&
      canShareChunk(previous.locator, chunk.locator)
    ) {
      const text = `${previous.text}\n\n${chunk.text}`;
      merged[merged.length - 1] = {
        ...previous,
        text,
        tokenCount: countTokens(text),
        locator: widen(previous.locator, chunk.locator),
      };
      continue;
    }

    merged.push(chunk);
  }

  return merged.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}

/** Extends a locator's range to cover a chunk merged into it. */
function widen(a: Chunk["locator"], b: Chunk["locator"]): Chunk["locator"] {
  if (a.kind === "text" && b.kind === "text") {
    return { ...a, endChar: Math.max(a.endChar, b.endChar) };
  }
  if (a.kind === "web" && b.kind === "web") {
    return { ...a, endChar: Math.max(a.endChar, b.endChar) };
  }
  if (a.kind === "timed" && b.kind === "timed") {
    return { ...a, endSec: Math.max(a.endSec, b.endSec) };
  }
  return a;
}
