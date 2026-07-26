import { apiFetch } from "@/lib/api-client";
import type { ChatDto, MessageDto } from "@/types/api";

export function fetchChats(notebookId: string): Promise<ChatDto[]> {
  return apiFetch<ChatDto[]>(`/notebooks/${notebookId}/chats`);
}

export function createChat(
  notebookId: string,
  title?: string,
): Promise<ChatDto> {
  return apiFetch<ChatDto>(`/notebooks/${notebookId}/chats`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function fetchMessages(
  notebookId: string,
  chatId: string,
): Promise<MessageDto[]> {
  return apiFetch<MessageDto[]>(
    `/notebooks/${notebookId}/chats/${chatId}/messages`,
  );
}

export function stopGeneration(
  notebookId: string,
  chatId: string,
  messageId: string,
): Promise<{ stopped: boolean }> {
  return apiFetch(
    `/notebooks/${notebookId}/chats/${chatId}/messages/${messageId}/stop`,
    {
      method: "POST",
    },
  );
}

/**
 * Clears the transcript by deleting the chat itself.
 *
 * The panel creates a chat whenever the notebook has none, so removing it is
 * the whole operation: the messages and their citations cascade in the
 * database, and a fresh empty chat appears on the next refetch.
 */
export function deleteChat(notebookId: string, chatId: string): Promise<void> {
  return apiFetch<void>(`/notebooks/${notebookId}/chats/${chatId}`, {
    method: "DELETE",
  });
}
