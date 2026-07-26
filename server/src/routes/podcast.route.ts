import { Router } from "express";
import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { validate } from "@/middleware/validate";
import { requireNotebook } from "@/middleware/ownership";
import { db } from "@/db/client";
import { podcasts, podcastAudio } from "@/db/schema";
import { podcastQueue } from "@/queues";
import { notFound } from "@/lib/errors";

export const podcastRouter: Router = Router({ mergeParams: true });

const createBody = z.object({
  sourceIds: z.array(z.uuid()).default([]),
  lengthMinutes: z.union([z.literal(3), z.literal(6), z.literal(10)]).default(3),
});

const podcastIdParams = z.object({ notebookId: z.uuid(), podcastId: z.uuid() });

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
      res.setHeader("Content-Length", String(audio.sizeBytes));
      res.setHeader("Accept-Ranges", "bytes");
      res.send(audio.bytes);
    })
    .catch(next);
});
