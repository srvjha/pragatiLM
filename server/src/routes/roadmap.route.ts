import { Router } from "express";
import { z } from "zod";
import { validate } from "@/middleware/validate";
import { requireNotebook } from "@/middleware/ownership";
import { canGenerateRoadmap, findRoadmap } from "@/services/roadmap/roadmap.service";
import { badRequest } from "@/lib/errors";
import { roadmapQueue } from "@/queues";

export const roadmapRouter: Router = Router({ mergeParams: true });

const generateBody = z.object({
  level: z.enum(["new", "some", "experienced"]),
  goal: z.string().trim().max(500).optional(),
});

roadmapRouter.get("/", (req, res, next) => {
  const notebookId = requireNotebook(req).id;

  Promise.all([findRoadmap(notebookId), canGenerateRoadmap(notebookId)])
    .then(([roadmap, canGenerate]) => res.json({ data: { roadmap: roadmap ?? null, canGenerate } }))
    .catch(next);
});

roadmapRouter.post("/", validate({ body: generateBody }), (req, res, next) => {
  const notebookId = requireNotebook(req).id;
  const body = req.body as z.infer<typeof generateBody>;

  canGenerateRoadmap(notebookId)
    .then(async (canGenerate) => {
      // FR-6.1: the entry point is refused with a reason rather than producing
      // an ungrounded roadmap from prose.
      if (!canGenerate) {
        throw badRequest(
          "Add a video or a transcript source before generating a roadmap. Pins are timestamps, so prose cannot support one.",
        );
      }

      await roadmapQueue.add("generate-roadmap", { notebookId, ...body }, { attempts: 1 });
      res.status(202).json({ data: { status: "QUEUED" } });
    })
    .catch(next);
});
