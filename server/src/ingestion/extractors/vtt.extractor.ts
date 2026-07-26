import { parseSync } from "subtitle";
import {
  ExtractionError,
  type Extractor,
  type ExtractorInput,
  type ExtractionResult,
} from "./types";
import type { Block } from "./types";

/**
 * VTT and SRT. The `subtitle` package handles both formats and both timestamp
 * dialects, so the work here is turning cues into blocks that carry their time
 * range, and lifting speaker labels out of the cue text.
 */
export const vttExtractor: Extractor = {
  type: "VTT",

  // Async for the same reason as the text extractor: throws must reject.
  // eslint-disable-next-line @typescript-eslint/require-await
  async extract(input: ExtractorInput): Promise<ExtractionResult> {
    if (!input.bytes) {
      throw new ExtractionError("This transcript has no stored content.");
    }

    const raw = input.bytes.toString("utf8").replace(/^\uFEFF/, "");
    let nodes: ReturnType<typeof parseSync>;

    try {
      nodes = parseSync(raw);
    } catch {
      throw new ExtractionError("This file could not be read as a VTT or SRT transcript.");
    }

    const blocks: Block[] = [];
    const speakers = new Set<string>();

    for (const node of nodes) {
      if (node.type !== "cue") continue;

      const { text, speaker } = splitSpeaker(node.data.text);
      if (text.length === 0) continue;
      if (speaker) speakers.add(speaker);

      blocks.push({
        text: speaker ? `${speaker}: ${text}` : text,
        locator: {
          kind: "timed",
          // The package reports milliseconds; locators are in seconds so the
          // viewer and the YouTube player can use them without conversion.
          startSec: node.data.start / 1000,
          endSec: node.data.end / 1000,
        },
      });
    }

    if (blocks.length === 0) {
      throw new ExtractionError("This transcript contains no readable cues.");
    }

    const last = blocks[blocks.length - 1];

    return {
      blocks,
      metadata: {
        cueCount: blocks.length,
        durationSec: last && last.locator.kind === "timed" ? Math.round(last.locator.endSec) : 0,
        ...(speakers.size > 0 ? { author: [...speakers].join(", ") } : {}),
      },
    };
  },
};

const VOICE_TAG = /^<v\s+([^>]+)>\s*/i;
const NAME_PREFIX = /^([A-Z][A-Za-z .'-]{0,40}):\s+/;

/**
 * Speaker labels appear either as a WebVTT voice tag or as a plain "Name:"
 * prefix. Both are lifted out so the label is not mistaken for content, then put
 * back in front of the text so retrieval can still match on who said it.
 */
function splitSpeaker(rawText: string): { text: string; speaker: string | null } {
  let text = rawText
    .replace(/<\/?(?!v\s)[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const voice = VOICE_TAG.exec(text);
  if (voice?.[1]) {
    return { text: text.replace(VOICE_TAG, "").trim(), speaker: voice[1].trim() };
  }

  const named = NAME_PREFIX.exec(text);
  if (named?.[1]) {
    text = text.replace(NAME_PREFIX, "").trim();
    return { text, speaker: named[1].trim() };
  }

  return { text, speaker: null };
}
