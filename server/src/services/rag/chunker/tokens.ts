import { getEncoding, type Tiktoken } from "js-tiktoken";

/**
 * FR-3.1 measures in tokens, not characters, because the target exists to fit a
 * context window. cl100k_base is the encoding for text-embedding-3-small.
 *
 * The encoder is built once: constructing it parses a large ranks table, and
 * doing that per chunk would dominate ingestion time.
 */
let encoder: Tiktoken | null = null;

function encoding(): Tiktoken {
  encoder ??= getEncoding("cl100k_base");
  return encoder;
}

export function countTokens(text: string): number {
  return encoding().encode(text).length;
}

/** The last `count` tokens of a text, decoded back to a string, used for overlap. */
export function tailTokens(text: string, count: number): string {
  if (count <= 0) return "";
  const tokens = encoding().encode(text);
  if (tokens.length <= count) return text;
  return encoding().decode(tokens.slice(-count));
}
