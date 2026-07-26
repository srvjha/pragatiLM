import { Router, type NextFunction, type Request, type Response } from "express";
import * as controller from "@/controllers/source.controller";
import { getContent, getFileStream } from "@/controllers/source-content.controller";
import { validate } from "@/middleware/validate";
import { openSseStream } from "@/lib/sse";
import { channels } from "@/lib/events";
import { requireNotebook } from "@/middleware/ownership";
import { uploaderFor, translateUploadError } from "@/lib/upload";
import {
  createTextBody,
  createWebBody,
  createYoutubeBody,
  sourceIdParams,
  updateSourceBody,
} from "@/schemas/source.schema";

/**
 * Mounted under /notebooks/:notebookId, which has already resolved and verified
 * the notebook, so nothing here re-checks ownership.
 */
export const sourceRouter: Router = Router({ mergeParams: true });

const pdfUpload = uploaderFor("PDF");
const vttUpload = uploaderFor("VTT");

/** multer rejects with its own error shape, so it is translated into an AppError. */
function upload(handler: ReturnType<typeof pdfUpload.array>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (error) {
        next(translateUploadError(error));
        return;
      }
      next();
    });
  };
}

sourceRouter.get("/", controller.list);

/**
 * FR-2.9. One stream per notebook rather than one per source, so adding ten PDFs
 * opens one connection. Declared before /:sourceId or "events" would be read as
 * an id and rejected as a non uuid.
 */
sourceRouter.get("/events", (req, res) => {
  openSseStream(req, res, channels.source(requireNotebook(req).id));
});

sourceRouter.post("/pdf", upload(pdfUpload.array("files", 10)), controller.createPdf);
sourceRouter.post("/vtt", upload(vttUpload.single("file")), controller.createVtt);
sourceRouter.post("/text", validate({ body: createTextBody }), controller.createText);
sourceRouter.post("/web", validate({ body: createWebBody }), controller.createWeb);
sourceRouter.post("/youtube", validate({ body: createYoutubeBody }), controller.createYoutube);

sourceRouter.get("/:sourceId/content", validate({ params: sourceIdParams }), getContent);
sourceRouter.get("/:sourceId/file", validate({ params: sourceIdParams }), getFileStream);
sourceRouter.get("/:sourceId", validate({ params: sourceIdParams }), controller.get);
sourceRouter.patch(
  "/:sourceId",
  validate({ params: sourceIdParams, body: updateSourceBody }),
  controller.update,
);
sourceRouter.post("/:sourceId/reindex", validate({ params: sourceIdParams }), controller.reindex);
sourceRouter.delete("/:sourceId", validate({ params: sourceIdParams }), controller.remove);
