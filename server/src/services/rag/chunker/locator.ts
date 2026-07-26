import type { Locator } from "@/types/domain";
import type { Block } from "@/ingestion/extractors/types";

/**
 * Two blocks may share a chunk only if the resulting locator still points at
 * exactly where the text is.
 *
 * For a PDF that means the same page. A 900 token chunk will happily swallow
 * three short pages, and the citation would then open the viewer on the first of
 * them while the answer came from the third. Citation accuracy is the thing this
 * product is judged on, so the page boundary wins over the token target.
 *
 * Text and web locators carry a character range, so a chunk spanning several
 * blocks still describes itself correctly by widening that range.
 */
export function canShareChunk(a: Locator, b: Locator): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "pdf" && b.kind === "pdf") return a.page === b.page;
  return true;
}

/** The locator describing a whole group of blocks. */
export function spanLocator(blocks: Block[]): Locator {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];

  if (!first) throw new Error("Cannot build a locator for an empty group");
  if (!last) return first.locator;

  switch (first.locator.kind) {
    case "pdf":
      return first.locator;

    case "text":
      return {
        kind: "text",
        startChar: first.locator.startChar,
        endChar: last.locator.kind === "text" ? last.locator.endChar : first.locator.endChar,
      };

    case "web":
      return {
        // The heading path of the block the chunk starts in, which is the
        // section a reader would say it came from.
        kind: "web",
        headingPath: first.locator.headingPath,
        startChar: first.locator.startChar,
        endChar: last.locator.kind === "web" ? last.locator.endChar : first.locator.endChar,
      };

    case "timed":
      return {
        kind: "timed",
        startSec: first.locator.startSec,
        endSec: last.locator.kind === "timed" ? last.locator.endSec : first.locator.endSec,
      };
  }
}
