import {
  ExtractionError,
  type Extractor,
  type ExtractorInput,
  type ExtractionResult,
} from "./types";

/**
 * Plain text and markdown. Character offsets are preserved against the
 * normalised text, and the same normalisation runs before the text is served to
 * the viewer, so a highlight lands where the locator says it does.
 */
export const textExtractor: Extractor = {
  type: "TEXT",

  // Async so that a validation throw becomes a rejection. A synchronous throw
  // from a Promise returning function escapes the caller's .catch().
  // eslint-disable-next-line @typescript-eslint/require-await
  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.bytes) {
      throw new ExtractionError("This text source has no stored content.");
    }

    const raw = input.bytes.toString("utf8");
    // Line endings only. Collapsing all whitespace would destroy the paragraph
    // boundaries the chunker splits on and shift every offset.
    const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

    if (text.length === 0) {
      throw new ExtractionError("This file is empty.");
    }

    return { blocks: splitParagraphs(text), metadata: { charCount: text.length } };
  },
};

/**
 * Paragraph blocks with real offsets into the normalised text. The offsets are
 * found by walking the string rather than by accumulating lengths, so a run of
 * blank lines cannot drift them.
 */
function splitParagraphs(
  text: string,
): { text: string; locator: { kind: "text"; startChar: number; endChar: number } }[] {
  const blocks: { text: string; locator: { kind: "text"; startChar: number; endChar: number } }[] =
    [];
  const pattern = /\n\s*\n/g;

  let start = 0;
  let match: RegExpExecArray | null;

  const push = (from: number, to: number) => {
    const slice = text.slice(from, to);
    const leading = slice.length - slice.trimStart().length;
    const trimmed = slice.trim();
    if (trimmed.length === 0) return;

    blocks.push({
      text: trimmed,
      locator: {
        kind: "text",
        startChar: from + leading,
        endChar: from + leading + trimmed.length,
      },
    });
  };

  while ((match = pattern.exec(text)) !== null) {
    push(start, match.index);
    start = match.index + match[0].length;
  }
  push(start, text.length);

  return blocks;
}
