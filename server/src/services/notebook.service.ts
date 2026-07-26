import * as repo from "@/db/repositories/notebook.repository";
import { enqueuePurge } from "@/queues";
import { notFound } from "@/lib/errors";
import type { NotebookDto, NotebookListItemDto } from "@/types/api";
import type { Notebook } from "@/db/schema";

const DEFAULT_NAME = "Untitled notebook";

function toDto(row: Notebook): NotebookDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotebooks(userId: string): Promise<NotebookListItemDto[]> {
  const rows = await repo.listNotebooks(userId);

  return rows.map((row) => ({
    ...toDto(row),
    sourceCount: row.sourceCount,
    lastActivityAt: new Date(row.lastActivityAt).toISOString(),
  }));
}

export async function getNotebook(id: string): Promise<NotebookDto> {
  const row = await repo.findNotebookById(id);
  if (!row) throw notFound("Notebook not found");
  return toDto(row);
}

export async function createNotebook(userId: string, name?: string): Promise<NotebookDto> {
  const trimmed = name?.trim();
  return toDto(
    await repo.createNotebook(userId, trimmed && trimmed.length > 0 ? trimmed : DEFAULT_NAME),
  );
}

export async function renameNotebook(id: string, name: string): Promise<NotebookDto> {
  const row = await repo.renameNotebook(id, name.trim());
  if (!row) throw notFound("Notebook not found");
  return toDto(row);
}

/**
 * FR-1.4. Sources, chunks, chats, citations, roadmaps, podcasts and stored bytes
 * all cascade in the database. Qdrant points are not in that transaction, so the
 * points are removed by a retried job and swept up by reconciliation if it never
 * runs.
 */
export async function deleteNotebook(id: string): Promise<void> {
  const deleted = await repo.deleteNotebook(id);
  if (!deleted) throw notFound("Notebook not found");

  await enqueuePurge({ sourceId: "", notebookId: id, vectorIds: [] });
}
