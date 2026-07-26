import { z } from "zod";

export const sourceIdParams = z.object({
  notebookId: z.uuid(),
  sourceId: z.uuid("sourceId must be a uuid"),
});

export const createTextBody = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1, "Paste some text or upload a file"),
});

export const createWebBody = z.object({ url: z.string().trim().min(1, "A URL is required") });
export const createYoutubeBody = z.object({
  url: z.string().trim().min(1, "A YouTube URL is required"),
});

export const updateSourceBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    selected: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.selected !== undefined, {
    message: "Provide a title or a selected flag",
  });

export type CreateTextBody = z.infer<typeof createTextBody>;
export type CreateWebBody = z.infer<typeof createWebBody>;
export type CreateYoutubeBody = z.infer<typeof createYoutubeBody>;
export type UpdateSourceBody = z.infer<typeof updateSourceBody>;
