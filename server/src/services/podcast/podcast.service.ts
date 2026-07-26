import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { db } from "@/db/client";
import { chunks, podcasts, podcastAudio, sources } from "@/db/schema";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import { ttsProvider } from "@/providers/tts";
import type { PodcastTurn } from "@/types/domain";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * FR-7. Two hosts talking about the notebook's own material.
 *
 * The grounding rule is the same as everywhere else: the script writer sees only
 * material derived from the sources and is told not to add anything outside
 * them, and each turn records which sources it drew on, so the script beside the
 * player can be checked rather than trusted.
 */
const turnSchema = z.object({
  host: z.enum(["A", "B"]).describe("A is the female voice, B is the male voice."),
  text: z.string().describe("What this host says. Spoken register, no stage directions."),
  sourceIds: z.array(z.string()).describe("Ids of the sources this turn draws on."),
});

const scriptSchema = z.object({
  title: z.string().describe("A short episode title."),
  turns: z.array(turnSchema).describe("Alternating turns between the two hosts."),
});

/** Roughly 150 spoken words a minute, which sets how much script to ask for. */
const WORDS_PER_MINUTE = 150;

export async function buildScript(
  notebookId: string,
  sourceIds: string[],
  lengthMinutes: number,
): Promise<{ title: string; turns: PodcastTurn[] }> {
  if (!hasLlmCredentials()) {
    throw new Error("OPENAI_API_KEY is not set, so a podcast cannot be generated.");
  }

  const rows = await db
    .select({ sourceId: chunks.sourceId, title: sources.title, text: chunks.text })
    .from(chunks)
    .innerJoin(sources, eq(sources.id, chunks.sourceId))
    .where(
      and(
        eq(chunks.notebookId, notebookId),
        eq(sources.status, "READY"),
        sourceIds.length > 0 ? inArray(chunks.sourceId, sourceIds) : undefined,
      ),
    )
    .orderBy(chunks.chunkIndex);

  if (rows.length === 0) {
    throw new Error("There is nothing indexed to make a podcast from.");
  }

  // Grouped per source so the script writer can attribute a turn, and capped so
  // a long notebook does not blow the context window.
  const bySource = new Map<string, { title: string; text: string[] }>();
  for (const row of rows) {
    const entry = bySource.get(row.sourceId) ?? { title: row.title, text: [] };
    if (entry.text.length < 12) entry.text.push(row.text);
    bySource.set(row.sourceId, entry);
  }

  const material = [...bySource.entries()]
    .map(([sourceId, entry]) => `id=${sourceId} "${entry.title}"\n${entry.text.join("\n")}`)
    .join("\n\n");

  const targetWords = lengthMinutes * WORDS_PER_MINUTE;
  const model = chatModel("chat", 0.6).withStructuredOutput(scriptSchema, { name: "podcast" });

  const script = await model.invoke([
    {
      role: "system",
      content: [
        "You write a two host audio conversation about material the listener already owns.",
        "Host A is curious and asks the questions a listener would. Host B explains.",
        "Use only the supplied material. Do not add facts, examples or figures from anywhere else.",
        "Attribute every turn to the source ids it draws on.",
        "Write speech, not prose: no headings, no bullet points, no stage directions.",
        `Aim for roughly ${targetWords} words in total.`,
      ].join(" "),
    },
    { role: "user", content: material },
  ]);

  const known = new Set(bySource.keys());

  return {
    title: script.title,
    turns: script.turns.map((turn) => ({
      host: turn.host,
      text: turn.text,
      // An invented source id would make the attribution meaningless, so only
      // ids that were actually supplied survive.
      sourceIds: turn.sourceIds.filter((id) => known.has(id)),
    })),
  };
}

export type ProgressReporter = (stage: string, progress: number) => Promise<void>;

/**
 * Synthesises each turn, then stitches. Segments are written to a temp
 * directory and removed in a finally block, so a failure partway leaves no
 * orphaned audio behind.
 */
export async function synthesiseEpisode(
  turns: PodcastTurn[],
  report: ProgressReporter,
): Promise<{ bytes: Buffer; durationSec: number }> {
  const tts = ttsProvider();
  const directory = await mkdtemp(join(tmpdir(), "notebook-podcast-"));

  try {
    const files: string[] = [];

    for (const [index, turn] of turns.entries()) {
      await report(
        `SYNTHESIZING ${index + 1} of ${turns.length}`,
        20 + Math.round((index / turns.length) * 60),
      );

      const audio = await tts.synthesise(turn.text, turn.host === "A" ? "female" : "male");
      const file = join(directory, `turn-${String(index).padStart(3, "0")}.mp3`);
      await writeFile(file, audio);
      files.push(file);
    }

    await report("MIXING", 85);

    const output = join(directory, "episode.mp3");
    await concat(files, output, directory);

    return { bytes: await readFile(output), durationSec: await probeDuration(output) };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Plain concatenation: the segments are already one voice each, so a crossfade
 * would blur the handover rather than smooth it.
 */
function concat(files: string[], output: string, workingDirectory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    for (const file of files) command.input(file);

    command
      .on("end", () => resolve())
      .on("error", (error: Error) => reject(error))
      .mergeToFile(output, workingDirectory);
  });
}

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(file, (error, data) => {
      if (error) {
        resolve(0);
        return;
      }
      resolve(Math.round(data.format.duration ?? 0));
    });
  });
}

export async function saveEpisode(
  podcastId: string,
  bytes: Buffer,
  durationSec: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(podcastAudio).where(eq(podcastAudio.podcastId, podcastId));
    await tx.insert(podcastAudio).values({
      podcastId,
      mimeType: "audio/mpeg",
      sizeBytes: bytes.byteLength,
      bytes,
    });
    await tx
      .update(podcasts)
      .set({ status: "READY", stage: "READY", progress: 100, durationSec })
      .where(eq(podcasts.id, podcastId));
  });
}
