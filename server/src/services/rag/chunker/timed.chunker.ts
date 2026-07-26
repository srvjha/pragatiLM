import { countTokens } from "./tokens";
import { mergeSmallChunks } from "./prose.chunker";
import { spanLocator } from "./locator";
import type { Chunk, ChunkOptions } from "./types";
import type { Block } from "@/ingestion/extractors/types";

/**
 * YouTube and VTT. FR-3.2: cues merge forward until the chunk holds roughly 60
 * to 90 seconds of speech or hits the token target, whichever comes first, with
 * one cue of overlap.
 *
 * Cue boundaries are never broken. A chunk that started mid sentence would give
 * the viewer a timestamp that lands in the middle of a word, and the whole point
 * of the time range is that clicking it plays something coherent.
 */
export function chunkTimed(blocks: Block[], options: ChunkOptions): Chunk[] {
  const cues = blocks.filter((block) => block.locator.kind === "timed");
  if (cues.length === 0) return [];

  const chunks: Chunk[] = [];
  let current: Block[] = [];
  let currentTokens = 0;

  const spanOf = (group: Block[]): { startSec: number; endSec: number } => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      startSec: first && first.locator.kind === "timed" ? first.locator.startSec : 0,
      endSec: last && last.locator.kind === "timed" ? last.locator.endSec : 0,
    };
  };

  const flush = (overlapWith: Block | undefined) => {
    if (current.length === 0) return;

    const text = current.map((cue) => cue.text).join(" ");

    chunks.push({
      chunkIndex: chunks.length,
      text,
      tokenCount: countTokens(text),
      locator: spanLocator(current),
    });

    // One cue of overlap, so a sentence spanning the boundary is retrievable
    // from either side.
    current = overlapWith ? [overlapWith] : [];
    currentTokens = current.reduce((total, cue) => total + countTokens(cue.text), 0);
  };

  for (const cue of cues) {
    const tokens = countTokens(cue.text);
    const span = spanOf([...current, cue]);
    const speechSec = span.endSec - span.startSec;

    const wouldExceedTokens = currentTokens > 0 && currentTokens + tokens > options.targetTokens;
    const hasEnoughSpeech = current.length > 0 && speechSec > options.maxSpeechSec;

    if (wouldExceedTokens || hasEnoughSpeech) flush(current[current.length - 1]);

    current.push(cue);
    currentTokens += tokens;

    // Once past the minimum, close on the next natural pause rather than running
    // to the ceiling, so ranges land near sentence ends.
    const closing = spanOf(current);
    if (closing.endSec - closing.startSec >= options.minSpeechSec && endsSentence(cue.text)) {
      flush(cue);
    }
  }

  flush(undefined);

  return mergeSmallChunks(chunks, options);
}

function endsSentence(text: string): boolean {
  return /[.!?]["')\]]?\s*$/.test(text.trim());
}
