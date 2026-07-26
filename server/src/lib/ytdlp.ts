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

/** Preferred first, then whatever the video has. */
const LANGUAGE_PREFERENCE = "en.*,en,-live_chat";

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
export async function fetchYoutubeCaptions(url: string): Promise<YtCue[]> {
  const directory = await mkdtemp(join(tmpdir(), "notebook-yt-"));

  try {
    await run(
      binary(),
      [
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        LANGUAGE_PREFERENCE,
        "--skip-download",
        "--convert-subs",
        "srt",
        "--no-playlist",
        "--no-warnings",
        "-o",
        join(directory, "cap"),
        url,
      ],
      { timeout: TIMEOUT_MS },
    );

    const files = (await readdir(directory)).filter((name) => name.endsWith(".srt"));
    // Prefer an English track when the video carries several.
    const chosen = files.find((name) => /\.en([.-]|$)/i.test(name)) ?? files[0];

    if (!chosen) return [];

    const raw = (await readFile(join(directory, chosen), "utf8")).replace(/^\uFEFF/, "");

    return parseSync(raw)
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
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
