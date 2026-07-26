import type { NextFunction, Request, RequestHandler, Response } from "express";
import { findNotebookById } from "@/db/repositories/notebook.repository";
import { notFound } from "@/lib/errors";
import type { Notebook } from "@/db/schema";

declare module "express-serve-static-core" {
  interface Request {
    notebook?: Notebook;
  }
}

/**
 * FR-1.5. Resolves `:notebookId` once and hangs the row on the request, so every
 * nested route below it can assume the notebook exists and belongs where the
 * path says. A child resource that exists under a different notebook is a 404,
 * not a 200, because confirming its existence would leak across the boundary.
 */
export const resolveNotebook: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const notebookId = req.params.notebookId;

  if (typeof notebookId !== "string" || notebookId.length === 0) {
    next(notFound("Notebook not found"));
    return;
  }

  findNotebookById(notebookId)
    .then((notebook) => {
      if (!notebook) {
        next(notFound("Notebook not found"));
        return;
      }
      req.notebook = notebook;
      next();
    })
    .catch(next);
};

/** Reads the notebook the middleware above resolved. */
export function requireNotebook(req: Request): Notebook {
  if (!req.notebook) throw new Error("resolveNotebook must run before this handler");
  return req.notebook;
}
