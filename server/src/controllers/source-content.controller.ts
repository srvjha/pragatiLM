import type { RequestHandler } from "express";
import { requireNotebook } from "@/middleware/ownership";
import { findSource } from "@/db/repositories/source.repository";
import { getFile } from "@/db/repositories/source-file.repository";
import { listChunksForSource } from "@/db/repositories/chunk.repository";
import { notFound, badRequest } from "@/lib/errors";

/**
 * The viewer needs the source rendered, not retrieved, so this returns whole
 * content rather than chunks. Timed sources return their cues reassembled from
 * chunk locators, which is what lets the transcript highlight a cited range.
 */
export const getContent: RequestHandler = (req, res, next) => {
  const notebookId = requireNotebook(req).id;
  const sourceId = req.params.sourceId;

  if (typeof sourceId !== "string") {
    next(badRequest("sourceId is required"));
    return;
  }

  (async () => {
    const source = await findSource(notebookId, sourceId);
    if (!source) throw notFound("Source not found");

    switch (source.type) {
      case "PDF": {
        const stored = await getFile(source.id, "original");
        if (!stored) throw notFound("The original file is no longer available");

        return {
          kind: "pdf" as const,
          fileUrl: `/api/notebooks/${notebookId}/sources/${sourceId}/file`,
          pageCount: source.metadata.pageCount ?? 0,
        };
      }

      case "TEXT": {
        const stored = await getFile(source.id, "original");
        if (!stored) throw notFound("The original text is no longer available");

        // The same normalisation the extractor applied, so a character range
        // from a locator indexes the same string the viewer renders.
        const raw = stored.bytes.toString("utf8");
        return {
          kind: "text" as const,
          text: raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
        };
      }

      case "WEB": {
        const captured = await getFile(source.id, "captured");
        return {
          kind: "web" as const,
          // FR-5.9: the captured reader view, so the viewer works even if the
          // site has since changed or gone away.
          html: captured?.bytes.toString("utf8") ?? "",
          originalUrl: source.originalUrl,
        };
      }

      case "VTT":
      case "YOUTUBE": {
        const chunks = await listChunksForSource(source.id);
        const cues = chunks
          .filter((chunk) => chunk.locator.kind === "timed")
          .map((chunk) => ({
            startSec: chunk.locator.kind === "timed" ? chunk.locator.startSec : 0,
            endSec: chunk.locator.kind === "timed" ? chunk.locator.endSec : 0,
            text: chunk.text,
          }));

        return {
          kind: "timed" as const,
          cues,
          ...(source.metadata.videoId ? { videoId: source.metadata.videoId } : {}),
        };
      }
    }
  })()
    .then((data) => res.json({ data }))
    .catch(next);
};

/** Streams the stored bytes, used by the PDF viewer and the download fallback. */
export const getFileStream: RequestHandler = (req, res, next) => {
  const notebookId = requireNotebook(req).id;
  const sourceId = req.params.sourceId;

  if (typeof sourceId !== "string") {
    next(badRequest("sourceId is required"));
    return;
  }

  (async () => {
    const source = await findSource(notebookId, sourceId);
    if (!source) throw notFound("Source not found");

    const stored = await getFile(source.id, "original");
    if (!stored) throw notFound("The original file is no longer available");

    res.setHeader("Content-Type", stored.mimeType);
    res.setHeader("Content-Length", String(stored.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(stored.filename)}"`,
    );
    res.send(stored.bytes);
  })().catch(next);
};
