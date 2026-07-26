import type { Request, RequestHandler, Response, NextFunction } from "express";
import * as service from "@/services/notebook.service";
import { requireNotebook } from "@/middleware/ownership";
import { requireUser } from "@/middleware/session";
import type { CreateNotebookBody, UpdateNotebookBody } from "@/schemas/notebook.schema";

/**
 * Controllers orchestrate and shape the response. They hold no logic and touch
 * no storage, which is the layering every later feature copies.
 */
export const list: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  service
    .listNotebooks(requireUser(req).id)
    .then((data) => res.json({ data }))
    .catch(next);
};

export const get: RequestHandler = (req: Request, res: Response) => {
  const notebook = requireNotebook(req);
  res.json({
    data: {
      id: notebook.id,
      name: notebook.name,
      createdAt: notebook.createdAt.toISOString(),
      updatedAt: notebook.updatedAt.toISOString(),
    },
  });
};

export const create: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as CreateNotebookBody;
  service
    .createNotebook(requireUser(req).id, body.name)
    .then((data) => res.status(201).json({ data }))
    .catch(next);
};

export const update: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const body = req.body as UpdateNotebookBody;
  service
    .renameNotebook(requireNotebook(req).id, body.name)
    .then((data) => res.json({ data }))
    .catch(next);
};

export const remove: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  service
    .deleteNotebook(requireNotebook(req).id)
    .then(() => res.status(204).end())
    .catch(next);
};
