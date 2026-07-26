import { extractText, getDocumentProxy } from "unpdf";
import {
  ExtractionError,
  type Extractor,
  type ExtractorInput,
  type ExtractionResult,
} from "./types";
import type { Block } from "./types";

/**
 * A page with almost no extractable characters is a scan, not an empty page.
 * The threshold is deliberately low: a title page or a figure page legitimately
 * has very little text, so the judgement is made across the document rather than
 * per page.
 */
const MIN_CHARS_PER_PAGE = 40;
const SCANNED_PAGE_RATIO = 0.8;

export const pdfExtractor: Extractor = {
  type: "PDF",

  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.bytes) {
      throw new ExtractionError("This PDF has no stored file.");
    }

    let pages: string[];

    try {
      const document = await getDocumentProxy(new Uint8Array(input.bytes));
      const result = await extractText(document, { mergePages: false });
      pages = result.text;
    } catch {
      throw new ExtractionError("This PDF could not be opened. It may be corrupt or encrypted.");
    }

    if (pages.length === 0) {
      throw new ExtractionError("This PDF has no pages.");
    }

    const sparsePages = pages.filter((page) => normalise(page).length < MIN_CHARS_PER_PAGE).length;

    if (sparsePages >= pages.length * SCANNED_PAGE_RATIO) {
      throw new ExtractionError(
        "This PDF has no extractable text layer, it looks like a scan. Try a text based PDF, or paste the text as a Text source.",
      );
    }

    const blocks: Block[] = [];

    for (const [index, page] of pages.entries()) {
      const text = normalise(page);
      if (text.length === 0) continue;

      blocks.push({
        text,
        // Pages are 1 based everywhere the user sees them, and the viewer jumps
        // by this number directly.
        locator: { kind: "pdf", page: index + 1 },
      });

      await input.onProgress?.(
        `Reading page ${index + 1} of ${pages.length}`,
        Math.round(((index + 1) / pages.length) * 100),
      );
    }

    if (blocks.length === 0) {
      throw new ExtractionError("No text could be read from this PDF.");
    }

    return {
      blocks,
      metadata: {
        pageCount: pages.length,
        charCount: blocks.reduce((total, block) => total + block.text.length, 0),
      },
    };
  },
};

/**
 * pdf.js emits text positionally, so line breaks inside a paragraph are an
 * artefact of layout rather than meaning. Runs of whitespace collapse, but blank
 * lines survive as paragraph boundaries for the chunker.
 */
function normalise(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
