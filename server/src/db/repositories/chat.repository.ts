import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, citations, messages } from "@/db/schema";
import type { Chat, Citation, Message, MessageStatus } from "@/db/schema";
import type { ResolvedCitation } from "@/services/rag/citations";

export async function listChats(notebookId: string): Promise<Chat[]> {
  return db
    .select()
    .from(chats)
    .where(eq(chats.notebookId, notebookId))
    .orderBy(desc(chats.createdAt));
}

export async function findChat(notebookId: string, chatId: string): Promise<Chat | undefined> {
  const [row] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.notebookId, notebookId), eq(chats.id, chatId)))
    .limit(1);
  return row;
}

export async function createChat(notebookId: string, title: string): Promise<Chat> {
  const [row] = await db.insert(chats).values({ notebookId, title }).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function deleteChat(notebookId: string, chatId: string): Promise<boolean> {
  const rows = await db
    .delete(chats)
    .where(and(eq(chats.notebookId, notebookId), eq(chats.id, chatId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}

export type MessageWithCitations = Message & { citations: Citation[] };

export async function listMessages(chatId: string): Promise<MessageWithCitations[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));

  if (rows.length === 0) return [];

  const ids = new Set(rows.map((row) => row.id));
  const allCitations = await db.select().from(citations);

  const byMessage = new Map<string, Citation[]>();
  for (const citation of allCitations) {
    if (!ids.has(citation.messageId)) continue;
    const list = byMessage.get(citation.messageId) ?? [];
    list.push(citation);
    byMessage.set(citation.messageId, list);
  }

  return rows.map((row) => ({
    ...row,
    citations: (byMessage.get(row.id) ?? []).sort((a, b) => a.markerIndex - b.markerIndex),
  }));
}

/** The last few turns, used to resolve a follow up into a standalone question. */
export async function recentTurns(
  chatId: string,
  limit = 4,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.reverse();
}

export async function insertMessage(values: {
  chatId: string;
  role: "user" | "assistant";
  content: string;
  status?: MessageStatus;
}): Promise<Message> {
  const [row] = await db.insert(messages).values(values).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function findMessage(messageId: string): Promise<Message | undefined> {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  return row;
}

/**
 * Finalising an assistant message. Citations are replaced rather than appended,
 * so a retry cannot leave two generations of them attached.
 */
export async function completeMessage(input: {
  messageId: string;
  content: string;
  status: MessageStatus;
  retrievalRunId?: string | null;
  citations: ResolvedCitation[];
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(messages)
      .set({
        content: input.content,
        status: input.status,
        ...(input.retrievalRunId !== undefined ? { retrievalRunId: input.retrievalRunId } : {}),
      })
      .where(eq(messages.id, input.messageId));

    await tx.delete(citations).where(eq(citations.messageId, input.messageId));

    if (input.citations.length === 0) return;

    await tx.insert(citations).values(
      input.citations.map((citation) => ({
        messageId: input.messageId,
        sourceId: citation.sourceId,
        chunkId: citation.chunkId,
        sourceTitle: citation.sourceTitle,
        sourceType: citation.sourceType,
        snippet: citation.snippet,
        locator: citation.locator,
        score: Math.round(citation.score * 1000),
        markerIndex: citation.markerIndex,
      })),
    );
  });
}
