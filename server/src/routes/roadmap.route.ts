import { Router } from "express";
import { z } from "zod";
import { validate } from "@/middleware/validate";
import { requireNotebook } from "@/middleware/ownership";
import { chargeFor, requireCredits } from "@/middleware/credits";
import { canGenerateRoadmap, findRoadmap, startRoadmap } from "@/services/roadmap/roadmap.service";
import { badRequest } from "@/lib/errors";
import { roadmapQueue } from "@/queues";

export const roadmapRouter: Router = Router({ mergeParams: true });

const generateBody = z.object({
  level: z.enum(["new", "some", "experienced"]),
  goal: z.string().trim().max(500).optional(),
  /**
   * Which sources to build from. Omitted or empty means every timed source,
   * so an older client and a direct API call both keep working.
   */
  sourceIds: z.array(z.uuid()).max(50).optional(),
});

roadmapRouter.get("/", (req, res, next) => {
  const notebookId = requireNotebook(req).id;

  Promise.all([findRoadmap(notebookId), canGenerateRoadmap(notebookId)])
    .then(([roadmap, canGenerate]) => res.json({ data: { roadmap: roadmap ?? null, canGenerate } }))
    .catch(next);
});

roadmapRouter.post(
  "/",
  validate({ body: generateBody }),
  requireCredits("roadmap"),
  (req, res, next) => {
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

        // Written before the job is queued, so the panel has something to find
        // the moment it refetches. Enqueueing first would leave a window where a
        // fast worker finished before the row existed.
        await startRoadmap(notebookId, body.level, body.goal, body.sourceIds ?? []);
        await roadmapQueue.add(
          "generate-roadmap",
          // Per run, not per notebook. A roadmap is one row per notebook that is
          // replaced on every generation, so a ref of notebookId would refund
          // the first failed run and silently swallow every later one.
          { notebookId, ...body, credit: chargeFor(req) },
          { attempts: 1 },
        );
        res.status(202).json({ data: { status: "QUEUED" } });
      })
      .catch(next);
  },
);
