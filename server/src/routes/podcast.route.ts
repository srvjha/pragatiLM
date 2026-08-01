import { Router } from "express";
import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { validate } from "@/middleware/validate";
import { requireNotebook } from "@/middleware/ownership";
import { db } from "@/db/client";
import { podcasts, podcastAudio } from "@/db/schema";
import { podcastQueue } from "@/queues";
import { notFound } from "@/lib/errors";
import { DEFAULT_VOICE_PAIR, VOICE_PAIRS, VOICE_PAIR_IDS } from "@/providers/tts";

export const podcastRouter: Router = Router({ mergeParams: true });

const createBody = z.object({
  // Empty means every ready source, which is what the picker sends when
  // nothing has been unticked.
  sourceIds: z.array(z.uuid()).default([]),
  lengthMinutes: z.union([z.literal(3), z.literal(6), z.literal(10)]).default(3),
  voicePair: z.enum(VOICE_PAIR_IDS).default(DEFAULT_VOICE_PAIR),
});

const podcastIdParams = z.object({ notebookId: z.uuid(), podcastId: z.uuid() });

/**
 * The voice pairings on offer. Served rather than duplicated in the web app, so
 * the buttons and the values the API validates cannot drift apart.
 */
podcastRouter.get("/voice-pairs", (_req, res) => {
  res.json({
    data: VOICE_PAIR_IDS.map((id) => ({ id, label: VOICE_PAIRS[id].label })),
  });
});

podcastRouter.get("/", (req, res, next) => {
  db.select({
    id: podcasts.id,
    title: podcasts.title,
    script: podcasts.script,
    status: podcasts.status,
    stage: podcasts.stage,
    progress: podcasts.progress,
    durationSec: podcasts.durationSec,
    errorMessage: podcasts.errorMessage,
    createdAt: podcasts.createdAt,
  })
    .from(podcasts)
    .where(eq(podcasts.notebookId, requireNotebook(req).id))
    .orderBy(desc(podcasts.createdAt))
    .then((data) => res.json({ data }))
    .catch(next);
});

podcastRouter.post("/", validate({ body: createBody }), (req, res, next) => {
  const notebookId = requireNotebook(req).id;
  const body = req.body as z.infer<typeof createBody>;

  db.insert(podcasts)
    .values({ notebookId, title: "Generating...", status: "QUEUED", stage: "SCRIPTING" })
    .returning()
    .then(async ([row]) => {
      if (!row) throw new Error("Insert returned no row");

      await podcastQueue.add(
        "generate-podcast",
        {
          podcastId: row.id,
          notebookId,
          sourceIds: body.sourceIds,
          lengthMinutes: body.lengthMinutes,
          voicePair: body.voicePair,
        },
        { attempts: 1 },
      );

      res.status(202).json({ data: row });
    })
    .catch(next);
});

podcastRouter.get("/:podcastId", validate({ params: podcastIdParams }), (req, res, next) => {
  db.select()
    .from(podcasts)
    .where(
      and(
        eq(podcasts.notebookId, requireNotebook(req).id),
        eq(podcasts.id, String(req.params.podcastId)),
      ),
    )
    .limit(1)
    .then(([row]) => {
      if (!row) throw notFound("Episode not found");
      res.json({ data: row });
    })
    .catch(next);
});

podcastRouter.get("/:podcastId/audio", validate({ params: podcastIdParams }), (req, res, next) => {
  const podcastId = String(req.params.podcastId);

  db.select()
    .from(podcasts)
    .where(and(eq(podcasts.notebookId, requireNotebook(req).id), eq(podcasts.id, podcastId)))
    .limit(1)
    .then(async ([row]) => {
      if (!row) throw notFound("Episode not found");

      const [audio] = await db
        .select()
        .from(podcastAudio)
        .where(eq(podcastAudio.podcastId, podcastId))
        .limit(1);

      if (!audio) throw notFound("This episode has no audio yet");

      res.setHeader("Content-Type", audio.mimeType);
      res.setHeader("Accept-Ranges", "bytes");

      /**
       * Range requests are answered rather than only advertised.
       *
       * `Accept-Ranges: bytes` was being sent while every request got the whole
       * body back with a 200, which is a promise the response then breaks.
       * Chrome tolerates it and loses seeking; Safari asks for a range before
       * it will play anything at all and treats a 200 as a refusal, so an
       * episode that plays on one machine silently does not on another.
       */
      const total = audio.bytes.length;
      const requested = parseRange(req.headers.range, total);

      if (requested === "unsatisfiable") {
        res.setHeader("Content-Range", `bytes */${total}`);
        res.status(416).end();
        return;
      }

      if (requested) {
        const { start, end } = requested;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
        res.setHeader("Content-Length", String(end - start + 1));
        res.end(audio.bytes.subarray(start, end + 1));
        return;
      }

      res.setHeader("Content-Length", String(total));
      res.send(audio.bytes);
    })
    .catch(next);
});

/**
 * The one form of Range that matters here: a single byte range over a file the
 * server already holds whole. Anything stranger than that, including the
 * multi-range syntax no audio player sends, falls back to the entire body,
 * which is always a valid answer to a range request.
 */
function parseRange(
  header: string | undefined,
  total: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;

  // "bytes=-500" means the last 500 bytes, not a range starting at nothing.
  const suffix = rawStart === "";
  if (suffix && rawEnd === "") return null;

  const start = suffix ? Math.max(0, total - Number(rawEnd)) : Number(rawStart);
  const end = suffix || rawEnd === "" ? total - 1 : Math.min(Number(rawEnd), total - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    return "unsatisfiable";
  }

  return { start, end };
}
