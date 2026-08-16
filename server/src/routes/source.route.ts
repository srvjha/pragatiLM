import { Router, type NextFunction, type Request, type Response } from "express";
import * as controller from "@/controllers/source.controller";
import { getCaptions, getContent, getFileStream } from "@/controllers/source-content.controller";
import { validate } from "@/middleware/validate";
import { openSseStream } from "@/lib/sse";
import { channels } from "@/lib/events";
import { requireNotebook } from "@/middleware/ownership";
import { requireCredits } from "@/middleware/credits";
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

/**
 * Every way of adding a source costs a credit, charged here rather than in the
 * five controllers so a sixth way of adding one cannot arrive free.
 *
 * The credit is for the storage the source occupies from then on rather than the
 * embedding it took, which is almost free. `reindex` below is deliberately not
 * charged: it stores nothing new, and the reason somebody reindexes is usually
 * that this product failed to extract properly the first time.
 */
const chargeSource = requireCredits("source");

/**
 * Charged per file, and mounted after the upload parser rather than before it.
 *
 * Both details matter. This route takes up to ten PDFs in one request, so a flat
 * one-credit charge would be a tenfold under-charge — and the file count only
 * exists once multer has parsed the body. Running after the parser also means an
 * oversized or non-PDF upload is rejected before it costs anything.
 */
// Zero when nothing was attached — multer leaves `req.files` undefined rather
// than empty — so a request with no file passes through uncharged and the
// controller rejects it with a 400.
const chargePdfs = requireCredits("source", (req) =>
  Array.isArray(req.files) ? req.files.length : 0,
);

sourceRouter.post("/pdf", upload(pdfUpload.array("files", 10)), chargePdfs, controller.createPdf);
sourceRouter.post("/vtt", upload(vttUpload.single("file")), chargeSource, controller.createVtt);
sourceRouter.post("/text", validate({ body: createTextBody }), chargeSource, controller.createText);
sourceRouter.post("/web", validate({ body: createWebBody }), chargeSource, controller.createWeb);
sourceRouter.post(
  "/youtube",
  validate({ body: createYoutubeBody }),
  chargeSource,
  controller.createYoutube,
);

sourceRouter.get("/:sourceId/content", validate({ params: sourceIdParams }), getContent);
sourceRouter.get("/:sourceId/captions", validate({ params: sourceIdParams }), getCaptions);
sourceRouter.get("/:sourceId/file", validate({ params: sourceIdParams }), getFileStream);
sourceRouter.get("/:sourceId", validate({ params: sourceIdParams }), controller.get);
sourceRouter.patch(
  "/:sourceId",
  validate({ params: sourceIdParams, body: updateSourceBody }),
  controller.update,
);
sourceRouter.post("/:sourceId/reindex", validate({ params: sourceIdParams }), controller.reindex);
sourceRouter.delete("/:sourceId", validate({ params: sourceIdParams }), controller.remove);
