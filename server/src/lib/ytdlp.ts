import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "subtitle";
import { env } from "@/config/env";
import { childLogger } from "@/lib/logger";

const run = promisify(execFile);
const log = childLogger("ytdlp");

/**
 * Captions via yt-dlp, because YouTube no longer serves them to anyone else.
 *
 * The timedtext endpoint now returns an empty body without a proof of origin
 * token, and the get_transcript API answers 400. That is true of every video,
 * including ones with dozens of hand written caption tracks, so it is not a
 * property of any particular video and no amount of retrying fixes it.
 *
 * yt-dlp gets through because it tracks these changes as its entire purpose.
 * It is optional: without it, YouTube sources fail with an explanation and the
 * VTT upload route still works. Everything else in the product is unaffected.
 */

const TIMEOUT_MS = 60_000;

let available: boolean | null = null;

function binary(): string {
  return env.YTDLP_PATH ?? "yt-dlp";
}

/** Cached: the answer cannot change while the process is running. */
export async function hasYtDlp(): Promise<boolean> {
  if (available !== null) return available;

  try {
    const { stdout } = await run(binary(), ["--version"], { timeout: 10_000 });
    available = true;
    log.info({ version: stdout.trim() }, "yt-dlp available");
  } catch {
    available = false;
    log.warn(
      { binary: binary() },
      "yt-dlp not found; YouTube captions cannot be fetched, VTT upload still works",
    );
  }

  return available;
}

export type YtCue = { text: string; startSec: number; endSec: number };

/**
 * Downloads the caption track and returns its cues.
 *
 * `--convert-subs srt` matters: an auto generated VTT carries per word timing
 * tags and repeats each line as it rolls up the screen, so parsing it directly
 * yields the same sentence three or four times. The SRT conversion collapses
 * that to one cue per line, which is what the chunker wants.
 */
export async function fetchYoutubeCaptions(url: string, languages: string[]): Promise<YtCue[]> {
  const directory = await mkdtemp(join(tmpdir(), "notebook-yt-"));

  try {
    for (const language of orderLanguages(languages)) {
      try {
        await run(
          binary(),
          [
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs",
            language,
            "--skip-download",
            "--convert-subs",
            "srt",
            "--no-playlist",
            "--no-warnings",
            "-o",
            join(directory, `cap-${language}`),
            url,
          ],
          { timeout: TIMEOUT_MS },
        );
      } catch (error) {
        // One language at a time, deliberately. Passing several at once means a
        // single failure aborts the run and the rest are never tried.
        log.debug({ err: error, language }, "no captions in this language");
        continue;
      }

      const cues = await readCues(directory);
      if (cues.length > 0) {
        log.info({ language, cues: cues.length }, "captions fetched");
        return cues;
      }
    }

    return [];
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * English first, then the languages the video actually has.
 *
 * Asking for a language a video does not carry is not a harmless miss: yt-dlp
 * treats it as a request to auto translate, and YouTube answers that with 429.
 * Hardcoding "en" therefore turned every non English video into a rate limit
 * error, while the track it did have sat there downloadable. A video captioned
 * only in Hindi is worth indexing in Hindi.
 */
function orderLanguages(languages: string[]): string[] {
  const available = languages.filter(Boolean);
  const english = available.filter((code) => /^en\b|^en-/i.test(code));
  const rest = available.filter((code) => !english.includes(code));

  const ordered = [...new Set([...english, ...rest])].slice(0, 6);

  // "en" is only a guess for when the caller could not name anything at all.
  return ordered.length > 0 ? ordered : ["en"];
}

/** The first SRT written into the working directory, as cues. */
async function readCues(directory: string): Promise<YtCue[]> {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".srt"));
  const chosen = files[0];
  if (!chosen) return [];

  const raw = (await readFile(join(directory, chosen), "utf8")).replace(/^\uFEFF/, "");

  const cues = parseSync(raw)
    .filter((node) => node.type === "cue")
    .map((node) => {
      const cue = node.data as { start: number; end: number; text: string };
      return {
        // Auto captions still arrive with the occasional markup tag.
        text: cue.text
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim(),
        startSec: cue.start / 1000,
        endSec: cue.end / 1000,
      };
    })
    .filter((cue) => cue.text.length > 0);

  return collapseRolling(cues);
}

/**
 * Collapses rolling auto captions.
 *
 * YouTube's automatic captions scroll, and they do not scroll a whole line at
 * a time: each cue begins partway through the one before it and adds a few
 * words. So the tail of one cue is the head of the next, and a naive check for
 * "does this cue start with the previous one" catches almost none of it. The
 * transcript arrives with every phrase written two or three times, and indexed
 * that way one sentence fills several chunks and crowds the real results out.
 *
 * Each cue therefore keeps only the words the previous one did not already
 * end with. Overlap is matched on whole words, never mid word, and a cue left
 * with nothing new is dropped after extending the previous cue's end time so
 * no speech falls outside a range.
 */
function collapseRolling(cues: YtCue[]): YtCue[] {
  const kept: YtCue[] = [];

  for (const cue of cues) {
    const previous = kept[kept.length - 1];

    if (!previous) {
      kept.push({ ...cue });
      continue;
    }

    const fresh = withoutOverlap(previous.text, cue.text);

    if (fresh.length === 0) {
      previous.endSec = Math.max(previous.endSec, cue.endSec);
      continue;
    }

    kept.push({ ...cue, text: fresh });
  }

  return kept;
}

/** `next` with any leading run of words that already ends `previous` removed. */
function withoutOverlap(previous: string, next: string): string {
  const tail = previous.split(" ").filter(Boolean);
  const head = next.split(" ").filter(Boolean);
  const limit = Math.min(tail.length, head.length);

  // Longest overlap first, so "a b c" against "b c d" drops two words, not one.
  for (let size = limit; size > 0; size -= 1) {
    if (tail.slice(-size).join(" ") === head.slice(0, size).join(" ")) {
      return head.slice(size).join(" ");
    }
  }

  return next;
}
