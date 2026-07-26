import { apiFetch } from "@/lib/api-client";
import type { NotebookDto, NotebookListItemDto } from "@/types/api";

export function fetchNotebooks(): Promise<NotebookListItemDto[]> {
  return apiFetch<NotebookListItemDto[]>("/notebooks");
}

export function fetchNotebook(id: string): Promise<NotebookDto> {
  return apiFetch<NotebookDto>(`/notebooks/${id}`);
}

export function createNotebook(name?: string): Promise<NotebookDto> {
  return apiFetch<NotebookDto>("/notebooks", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameNotebook(id: string, name: string): Promise<NotebookDto> {
  return apiFetch<NotebookDto>(`/notebooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteNotebook(id: string): Promise<void> {
  return apiFetch<void>(`/notebooks/${id}`, { method: "DELETE" });
}
