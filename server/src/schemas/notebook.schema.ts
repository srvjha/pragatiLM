import { z } from "zod";

export const notebookIdParams = z.object({ notebookId: z.uuid("notebookId must be a uuid") });

export const createNotebookBody = z.object({
  // FR-1.1: an empty or absent name becomes the default rather than an error.
  name: z.string().trim().max(80, "Name is capped at 80 characters").optional(),
});

export const updateNotebookBody = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(80, "Name is capped at 80 characters"),
});

export type NotebookIdParams = z.infer<typeof notebookIdParams>;
export type CreateNotebookBody = z.infer<typeof createNotebookBody>;
export type UpdateNotebookBody = z.infer<typeof updateNotebookBody>;
