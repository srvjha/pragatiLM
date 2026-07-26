import { Router } from "express";
import * as controller from "@/controllers/notebook.controller";
import { validate } from "@/middleware/validate";
import { resolveNotebook } from "@/middleware/ownership";
import { requireSession } from "@/middleware/session";
import { sourceRouter } from "@/routes/source.route";
import { chatRouter } from "@/routes/chat.route";
import { roadmapRouter } from "@/routes/roadmap.route";
import { podcastRouter } from "@/routes/podcast.route";
import { retrievalRouter } from "@/routes/retrieval.route";
import { isDevelopment } from "@/config/env";
import { artifactLimiter, chatLimiter, ingestLimiter } from "@/middleware/rate-limit";
import {
  createNotebookBody,
  notebookIdParams,
  updateNotebookBody,
} from "@/schemas/notebook.schema";

export const notebookRouter: Router = Router();

// Nothing under this router is reachable without a session. Mounting the guard
// once here rather than per route means a route added later is protected by
// default, which is the failure mode worth designing for.
notebookRouter.use("/notebooks", requireSession);

notebookRouter.get("/notebooks", controller.list);
notebookRouter.post("/notebooks", validate({ body: createNotebookBody }), controller.create);

// Everything below is scoped to one notebook, resolved once here. Child routers
// mount under this same prefix and inherit the check rather than repeating it.
notebookRouter.use(
  "/notebooks/:notebookId",
  validate({ params: notebookIdParams }),
  resolveNotebook,
);

notebookRouter.use("/notebooks/:notebookId/sources", ingestLimiter, sourceRouter);
notebookRouter.use("/notebooks/:notebookId/chats", chatLimiter, chatRouter);
notebookRouter.use("/notebooks/:notebookId/roadmap", artifactLimiter, roadmapRouter);
notebookRouter.use("/notebooks/:notebookId/podcasts", artifactLimiter, podcastRouter);

if (isDevelopment) {
  notebookRouter.use("/notebooks/:notebookId/retrieval", retrievalRouter);
}

notebookRouter.get("/notebooks/:notebookId", controller.get);
notebookRouter.patch(
  "/notebooks/:notebookId",
  validate({ body: updateNotebookBody }),
  controller.update,
);
notebookRouter.delete("/notebooks/:notebookId", controller.remove);
