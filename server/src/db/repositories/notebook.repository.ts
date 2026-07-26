import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notebooks, sources } from "@/db/schema";
import type { Notebook } from "@/db/schema";

/**
 * The only place notebook queries are written. Services call these; they never
 * hold a query themselves.
 */
export type NotebookListItem = Notebook & { sourceCount: number; lastActivityAt: Date };

export async function listNotebooks(): Promise<NotebookListItem[]> {
  return db
    .select({
      id: notebooks.id,
      userId: notebooks.userId,
      name: notebooks.name,
      createdAt: notebooks.createdAt,
      updatedAt: notebooks.updatedAt,
      sourceCount: sql<number>`count(${sources.id})::int`,
      lastActivityAt: sql<Date>`greatest(${notebooks.updatedAt}, coalesce(max(${sources.createdAt}), ${notebooks.updatedAt}))`,
    })
    .from(notebooks)
    .leftJoin(sources, eq(sources.notebookId, notebooks.id))
    .groupBy(notebooks.id)
    .orderBy(desc(notebooks.updatedAt));
}

export async function findNotebookById(id: string): Promise<Notebook | undefined> {
  const [row] = await db.select().from(notebooks).where(eq(notebooks.id, id)).limit(1);
  return row;
}

export async function createNotebook(name: string): Promise<Notebook> {
  const [row] = await db.insert(notebooks).values({ name }).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function renameNotebook(id: string, name: string): Promise<Notebook | undefined> {
  const [row] = await db
    .update(notebooks)
    .set({ name, updatedAt: new Date() })
    .where(eq(notebooks.id, id))
    .returning();
  return row;
}

export async function deleteNotebook(id: string): Promise<boolean> {
  const rows = await db.delete(notebooks).where(eq(notebooks.id, id)).returning({
    id: notebooks.id,
  });
  return rows.length > 0;
}

export async function touchNotebook(id: string): Promise<void> {
  await db.update(notebooks).set({ updatedAt: new Date() }).where(eq(notebooks.id, id));
}
