import { env } from "@/config/env";
import { chunkProse } from "./prose.chunker";
import { chunkTimed } from "./timed.chunker";
import {
  DEFAULT_MAX_SPEECH_SEC,
  DEFAULT_MIN_SPEECH_SEC,
  DEFAULT_MIN_TOKENS,
  type Chunk,
  type ChunkOptions,
} from "./types";
import type { Block } from "@/ingestion/extractors/types";
import type { SourceType } from "@/db/schema";

export const defaultChunkOptions: ChunkOptions = {
  targetTokens: env.CHUNK_TARGET_TOKENS,
  overlapTokens: env.CHUNK_OVERLAP_TOKENS,
  minTokens: DEFAULT_MIN_TOKENS,
  minSpeechSec: DEFAULT_MIN_SPEECH_SEC,
  maxSpeechSec: DEFAULT_MAX_SPEECH_SEC,
};

/**
 * Strategy selection. The split is by locator shape rather than by source type:
 * anything with a time range chunks on cue boundaries, everything else chunks on
 * prose boundaries.
 */
export function chunkBlocks(
  type: SourceType,
  blocks: Block[],
  options: ChunkOptions = defaultChunkOptions,
): Promise<Chunk[]> {
  if (type === "YOUTUBE" || type === "VTT") {
    return Promise.resolve(chunkTimed(blocks, options));
  }
  return chunkProse(blocks, options);
}

export * from "./types";
export { chunkProse } from "./prose.chunker";
export { chunkTimed } from "./timed.chunker";
export { countTokens, tailTokens } from "./tokens";
