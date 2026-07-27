import { z } from "zod";
import { env } from "@/config/env";
import { redis } from "@/lib/clients/redis";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import { fetchCaptionsInLanguage, hasYtDlp } from "@/lib/ytdlp";
import { hasDevanagari, toLatin } from "@/lib/devanagari";
import { listChunksForSource } from "@/db/repositories/chunk.repository";
import { childLogger } from "@/lib/logger";
import type { Source } from "@/db/schema";
import type { CaptionTrack } from "@/types/domain";

const log = childLogger("captions");

export type Cue = { startSec: number; endSec: number; text: string };

/**
 * How a track came to exist, which the viewer shows because the three are not
 * equally trustworthy. A native track is what the video carries. A romanized
 * one is the same words in a different script, so it is exact. A translated
 * one is a model's reading of them, and the reader deserves to know that.
 */
export type TrackKind = "native" | "romanized" | "translated";

export type OfferedTrack = {
  code: string;
  label: string;
  kind: TrackKind;
};

/** The two tracks this product derives rather than downloads. */
export const HINGLISH = "hi-Latn";
export const TRANSLATED_ENGLISH = "en-x-mt";

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

const NAMES: Record<string, string> = {
  en: "English",
  hi: "हिन्दी",
  bn: "বাংলা",
  ta: "தமிழ்",
  te: "తెలుగు",
  mr: "मराठी",
  gu: "ગુજરાતી",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  pa: "ਪੰਜਾਬੀ",
  ur: "اردو",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ar: "العربية",
  ru: "Русский",
};

function labelFor(track: CaptionTrack): string {
  const base = track.code.split("-")[0]?.toLowerCase() ?? track.code;
  return NAMES[base] ?? track.label ?? track.code;
}

function isHindi(code: string): boolean {
  return /^hi\b|^hi-/i.test(code);
}

function isEnglish(code: string): boolean {
  return /^en\b|^en-/i.test(code);
}

/**
 * The languages the viewer may offer for a source.
 *
 * Two of them are not downloads. Hinglish is the Hindi track written in Latin
 * script, which is how most Hindi speakers actually type, and a great many
 * people who follow spoken Hindi easily cannot read Devanagari at speed.
 * English appears for a video that has no English track because otherwise the
 * transcript is closed to everyone who does not speak the language, and a
 * translation they can see is marked as one is better than nothing at all.
 *
 * Both are derived from a track that already exists, cue by cue, so every
 * language keeps the same timeline: a citation highlights the same moment
 * whichever one the reader is on.
 */
export function offeredTracks(source: Source, sample = ""): OfferedTrack[] {
  if (source.type !== "YOUTUBE") return [];

  const native = source.metadata.captionTracks ?? [];

  // What the transcript is actually written in, read off the text rather than
  // off the metadata. Every source added before the caption tracks were being
  // recorded has an empty metadata object, and requiring that list meant the
  // language switch never appeared for any of them: the transcript sat there
  // in Devanagari with no way to romanise it, and the only fix on offer was to
  // re-index. The script is right there in the text, so it is read from there.
  const devanagari = hasDevanagari(sample);

  const indexed = indexedTrack(source);
  const indexedIsDerived = indexed === TRANSLATED_ENGLISH || indexed === HINGLISH;

  /**
   * Keyed by code, because these come from three places that can name the same
   * track. A source with no recorded caption tracks whose indexed text is the
   * translation used to get one synthetic entry and one derived entry, both
   * called en-x-mt, which React rejected as a duplicate key and which would
   * have rendered the same language twice in the switch had it not.
   */
  const offered = new Map<string, OfferedTrack>();

  for (const track of native) {
    offered.set(track.code, {
      code: track.code,
      label: labelFor(track),
      kind: "native",
    });
  }

  // One synthetic entry standing for whatever was indexed, so the derived
  // tracks below have something to sit beside and switch back to. Skipped when
  // the indexed text is itself derived, since the branches below name it far
  // more accurately than "Original" would.
  if (offered.size === 0 && !indexedIsDerived) {
    offered.set(indexed, {
      code: indexed,
      label: devanagari ? "हिन्दी" : "Original",
      kind: "native",
    });
  }

  if (devanagari || native.some((track) => isHindi(track.code))) {
    offered.set(HINGLISH, { code: HINGLISH, label: "Hinglish", kind: "romanized" });
  }

  // A Devanagari transcript is translated before it is indexed, so for those
  // sources the translation is not an extra on the side, it is the track the
  // viewer opens on. Without this it would not appear in its own switch: the
  // sample it is judged from is by then already English, so nothing would ask
  // for a translation and the current track would have no entry to mark.
  const wantsEnglish =
    indexed === TRANSLATED_ENGLISH ||
    (devanagari && !native.some((track) => isEnglish(track.code)));

  if (wantsEnglish) {
    offered.set(TRANSLATED_ENGLISH, {
      code: TRANSLATED_ENGLISH,
      label: "English",
      kind: "translated",
    });
  }

  return [...offered.values()];
}

/**
 * The track that was chunked and embedded, which the viewer opens on.
 *
 * Never null. A source indexed before the language was recorded still has one
 * indexed transcript, and the switch needs a code to mark as current and to
 * return to; "original" names it without claiming to know which language it is.
 */
export function indexedTrack(source: Source): string {
  return source.metadata.captionLanguage ?? "original";
}

/**
 * The cues already in Postgres, from the track that was indexed.
 *
 * This is the one route that must not go back to YouTube: these are the exact
 * strings the answer was written from and the exact ranges its citations point
 * at, so re-downloading them risks a transcript that no longer lines up with
 * the highlight.
 */
async function indexedCues(sourceId: string): Promise<Cue[]> {
  const chunks = await listChunksForSource(sourceId);

  return chunks
    .filter((chunk) => chunk.locator.kind === "timed")
    .map((chunk) => ({
      startSec: chunk.locator.kind === "timed" ? chunk.locator.startSec : 0,
      endSec: chunk.locator.kind === "timed" ? chunk.locator.endSec : 0,
      text: chunk.text,
    }));
}

function cacheKey(sourceId: string, code: string): string {
  return `captions:${sourceId}:${code}`;
}

async function cached(sourceId: string, code: string): Promise<Cue[] | null> {
  try {
    const raw = await redis.get(cacheKey(sourceId, code));
    return raw ? (JSON.parse(raw) as Cue[]) : null;
  } catch (error) {
    log.warn({ err: error, sourceId, code }, "caption cache read failed");
    return null;
  }
}

async function store(sourceId: string, code: string, cues: Cue[]): Promise<void> {
  try {
    await redis.set(cacheKey(sourceId, code), JSON.stringify(cues), "EX", CACHE_TTL_SECONDS);
  } catch (error) {
    log.warn({ err: error, sourceId, code }, "caption cache write failed");
  }
}

export class CaptionError extends Error {}

/**
 * Cues for one language.
 *
 * Everything derived is built from the indexed track rather than from a fresh
 * download, so the cue boundaries are identical across languages and the
 * citation highlight lands in the same place in all of them.
 */
export async function cuesForTrack(source: Source, code: string): Promise<Cue[]> {
  const indexed = indexedTrack(source);

  if (code === indexed) return indexedCues(source.id);

  const hit = await cached(source.id, code);
  if (hit) return hit;

  const cues = await buildTrack(source, code);
  if (cues.length === 0) {
    throw new CaptionError("That transcript language is not available for this video.");
  }

  await store(source.id, code, cues);
  return cues;
}

async function buildTrack(source: Source, code: string): Promise<Cue[]> {
  if (code === HINGLISH) {
    const hindi = await hindiCues(source);
    return hindi.map((cue) => ({ ...cue, text: toLatin(cue.text) }));
  }

  if (code === TRANSLATED_ENGLISH) {
    const base = await indexedCues(source.id);
    if (base.length === 0) throw new CaptionError("This video has no transcript to translate.");
    return translateCues(base);
  }

  // A native track that is not the indexed one, which means downloading it.
  const url = source.originalUrl;
  if (!url) throw new CaptionError("This source has no video URL.");

  if (!(await hasYtDlp())) {
    throw new CaptionError(
      "Other caption languages need yt-dlp on the server. The indexed transcript is still available.",
    );
  }

  return fetchCaptionsInLanguage(url, code);
}

/** Devanagari cues, from the index when it holds them and YouTube when it does not. */
async function hindiCues(source: Source): Promise<Cue[]> {
  const indexed = await indexedCues(source.id);
  if (indexed.some((cue) => hasDevanagari(cue.text))) return indexed;

  const track = (source.metadata.captionTracks ?? []).find((entry) => isHindi(entry.code));
  if (!track || !source.originalUrl || !(await hasYtDlp())) {
    throw new CaptionError("This video has no Hindi track to romanise.");
  }

  return fetchCaptionsInLanguage(source.originalUrl, track.code);
}

const translationSchema = z.object({
  lines: z
    .array(
      z.object({
        n: z.number().int().describe("The line number given in the input."),
        text: z.string().describe("That line translated into English."),
      }),
    )
    .describe("One entry per input line, in the same order, with the same numbers."),
});

/**
 * Batches are sized by characters, not by line count.
 *
 * A line here is whatever the chunker produced, and that is not a subtitle: an
 * indexed passage runs to roughly 900 characters. Counting lines therefore put
 * an entire 24,000 character transcript into one request, and one request is
 * one sequential generation of 24,000 characters, which is slow for a reason
 * no amount of concurrency can help with — there was only ever one batch to
 * run. Output tokens are produced in series; the only way to go faster is to
 * ask several models for shorter pieces at once.
 *
 * 1,600 characters is small enough to come back quickly and long enough that
 * the model still sees the sentences around the one it is translating, which
 * subtitle text needs badly.
 */
const MAX_BATCH_CHARS = 1_600;

/** A ceiling for genuinely short cues, where the character budget never bites. */
const MAX_BATCH_LINES = 40;

const CONCURRENCY = 8;

const TRANSLATOR_SYSTEM = [
  "You translate subtitle lines into English.",
  "Return exactly one line out for every line in, keeping its number.",
  "Translate line by line: never merge two lines, never split one, never reorder them. Each line is timed to a moment in a video, so moving words between lines puts them under the wrong picture.",
  "A line that is already English is returned unchanged.",
  "Keep proper nouns, product names and technical terms as they are.",
  "Prefer the plain spoken register the speaker used over a formal one.",
].join(" ");

/**
 * Translates a cue list while keeping its timeline.
 *
 * Batched, because one call per cue on an hour of video is thousands of calls,
 * and one call for the whole transcript exceeds what a model will reliably
 * return in order. Fifty lines is small enough to come back intact and large
 * enough that the model can see the surrounding sentences, which subtitle text
 * badly needs: a single cue is often half a clause.
 *
 * Any line the model drops falls back to the original rather than vanishing. A
 * transcript with one untranslated line is usable; one with a hole in it, where
 * the timings no longer match the video, is not.
 */
async function translateCues(cues: Cue[]): Promise<Cue[]> {
  const texts = await translateTexts(cues.map((cue) => cue.text));
  return cues.map((cue, index) => ({ ...cue, text: texts[index] ?? cue.text }));
}

/**
 * Translates a list of passages into English, keeping them one to one.
 *
 * Exposed because indexing needs it as well as the viewer. A transcript whose
 * captions are Devanagari cannot be searched with an English question — not
 * approximately, but at all, since neither the keyword channel nor the vector
 * space has anything to match — so the ingestion pipeline translates before it
 * embeds. The two callers need exactly the same guarantee, which is that entry
 * n out is entry n in, said in English.
 */
export async function translateTexts(input: string[]): Promise<string[]> {
  const cues: Cue[] = input.map((text) => ({ startSec: 0, endSec: 0, text }));
  const out = await translateCueTexts(cues);
  return out.map((cue) => cue.text);
}

async function translateCueTexts(cues: Cue[]): Promise<Cue[]> {
  if (!hasLlmCredentials()) {
    throw new CaptionError("Translation needs a model, and no API key is configured.");
  }

  const batches = batchByLength(cues);

  const model = chatModel("translator", 0).withStructuredOutput(translationSchema, {
    name: "translated_lines",
  });

  log.info(
    { cues: cues.length, batches: batches.length, model: env.TRANSLATE_MODEL },
    "translating transcript",
  );

  const translated: Cue[][] = batches.map(() => []);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;

      const batch = batches[index];
      if (!batch) return;

      const numbered = batch.map((cue, offset) => `${offset + 1}. ${cue.text}`).join("\n");

      try {
        const result = await model.invoke([
          { role: "system", content: TRANSLATOR_SYSTEM },
          { role: "user", content: numbered },
        ]);

        const byNumber = new Map(result.lines.map((line) => [line.n, line.text]));
        translated[index] = batch.map((cue, offset) => ({
          ...cue,
          text: byNumber.get(offset + 1)?.trim() || cue.text,
        }));
      } catch (error) {
        log.warn({ err: error, batch: index }, "translation batch failed, keeping the original");
        translated[index] = batch;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

  return translated.flat();
}

/** Splits on a character budget, never leaving a single cue on its own line. */
function batchByLength(cues: Cue[]): Cue[][] {
  const batches: Cue[][] = [];
  let current: Cue[] = [];
  let length = 0;

  for (const cue of cues) {
    // A cue longer than the whole budget still has to go somewhere, so the
    // test is on the batch already being non-empty rather than on the fit.
    const wouldExceed = length + cue.text.length > MAX_BATCH_CHARS;

    if (current.length > 0 && (wouldExceed || current.length >= MAX_BATCH_LINES)) {
      batches.push(current);
      current = [];
      length = 0;
    }

    current.push(cue);
    length += cue.text.length;
  }

  if (current.length > 0) batches.push(current);

  return batches;
}
