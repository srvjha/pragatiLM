import type { NextFunction, Request, RequestHandler, Response } from "express";
import * as service from "@/services/source.service";
import { requireNotebook } from "@/middleware/ownership";
import { badRequest } from "@/lib/errors";
import type {
  CreateTextBody,
  CreateWebBody,
  CreateYoutubeBody,
  UpdateSourceBody,
} from "@/schemas/source.schema";

function requestId(req: Request): string | undefined {
  return typeof req.id === "string" ? req.id : undefined;
}

function sourceId(req: Request): string {
  const id = req.params.sourceId;
  if (typeof id !== "string") throw badRequest("sourceId is required");
  return id;
}

export const list: RequestHandler = (req, res, next) => {
  service
    .listSources(requireNotebook(req).id)
    .then((data) => res.json({ data }))
    .catch(next);
};

export const get: RequestHandler = (req, res, next) => {
  service
    .getSource(requireNotebook(req).id, sourceId(req))
    .then((data) => res.json({ data }))
    .catch(next);
};

/** FR-2.1: several PDFs in one action, each becoming its own source. */
export const createPdf: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    next(badRequest("Attach at least one PDF file."));
    return;
  }

  const notebookId = requireNotebook(req).id;

  // Sequential rather than parallel: two identical files in one upload must hit
  // the duplicate check, and concurrent inserts would race past it.
  (async () => {
    const created = [];
    const rejected = [];

    for (const file of files) {
      try {
        created.push(await service.addPdf(notebookId, file, requestId(req)));
      } catch (error) {
        rejected.push({
          filename: file.originalname,
          message: error instanceof Error ? error.message : "Could not add this file",
        });
      }
    }

    // A partial failure still returns 201 with what succeeded, because failing
    // the whole upload because one of five files was a duplicate is worse.
    if (created.length === 0 && rejected.length > 0) {
      res.status(409).json({
        error: { code: "CONFLICT", message: rejected[0]?.message ?? "No file could be added" },
      });
      return;
    }

    res.status(201).json({ data: created, ...(rejected.length > 0 ? { rejected } : {}) });
  })().catch(next);
};

export const createVtt: RequestHandler = (req, res, next) => {
  if (!req.file) {
    next(badRequest("Attach a .vtt or .srt file."));
    return;
  }

  service
    .addVtt(requireNotebook(req).id, req.file, requestId(req))
    .then((data) => res.status(201).json({ data }))
    .catch(next);
};

export const createText: RequestHandler = (req, res, next) => {
  const body = req.body as CreateTextBody;
  service
    .addText(requireNotebook(req).id, body, requestId(req))
    .then((data) => res.status(201).json({ data }))
    .catch(next);
};

export const createWeb: RequestHandler = (req, res, next) => {
  const body = req.body as CreateWebBody;
  service
    .addWeb(requireNotebook(req).id, body.url, requestId(req))
    .then((data) => res.status(201).json({ data }))
    .catch(next);
};

export const createYoutube: RequestHandler = (req, res, next) => {
  const body = req.body as CreateYoutubeBody;
  service
    .addYoutube(requireNotebook(req).id, body.url, requestId(req))
    .then((data) => res.status(201).json({ data }))
    .catch(next);
};

export const update: RequestHandler = (req, res, next) => {
  const body = req.body as UpdateSourceBody;
  service
    .updateSource(requireNotebook(req).id, sourceId(req), body)
    .then((data) => res.json({ data }))
    .catch(next);
};

export const reindex: RequestHandler = (req, res, next) => {
  service
    .reindexSource(requireNotebook(req).id, sourceId(req))
    .then((data) => res.status(202).json({ data }))
    .catch(next);
};

export const remove: RequestHandler = (req, res, next) => {
  service
    .deleteSource(requireNotebook(req).id, sourceId(req))
    .then(() => res.status(204).end())
    .catch(next);
};
