import type { Locator } from "@/types/domain";

/**
 * The chunker's output. `locator` points at where the chunk begins, which is
 * what a citation resolves to.
 */
export type Chunk = {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  locator: Locator;
};

export type ChunkOptions = {
  targetTokens: number;
  overlapTokens: number;
  /** FR-3.4: anything below this is merged into a neighbour rather than stored. */
  minTokens: number;
  /** FR-3.2: timed chunks aim for this much speech before the token target bites. */
  minSpeechSec: number;
  maxSpeechSec: number;
};

export const DEFAULT_MIN_TOKENS = 40;
export const DEFAULT_MIN_SPEECH_SEC = 60;
export const DEFAULT_MAX_SPEECH_SEC = 90;
