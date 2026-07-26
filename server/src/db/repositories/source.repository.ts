import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sources } from "@/db/schema";
import type { NewSource, Source, SourceStatus } from "@/db/schema";

export async function listSources(notebookId: string): Promise<Source[]> {
  return db
    .select()
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
    .orderBy(asc(sources.createdAt));
}

/**
 * Always scoped by notebook. A source id alone is never enough to reach a row,
 * which is what makes FR-1.5 an invariant of the data access layer rather than
 * something each route has to remember.
 */
export async function findSource(
  notebookId: string,
  sourceId: string,
): Promise<Source | undefined> {
  const [row] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.notebookId, notebookId), eq(sources.id, sourceId)))
    .limit(1);
  return row;
}

/**
 * Unscoped lookup, used only by workers. A job carries a source id and has no
 * notebook in hand; every request path goes through findSource instead.
 */
export async function findSourceById(sourceId: string): Promise<Source | undefined> {
  const [row] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  return row;
}

export async function findByContentHash(
  notebookId: string,
  contentHash: string,
): Promise<Source | undefined> {
  const [row] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.notebookId, notebookId), eq(sources.contentHash, contentHash)))
    .limit(1);
  return row;
}

export async function insertSource(values: NewSource): Promise<Source> {
  const [row] = await db.insert(sources).values(values).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function updateSource(
  notebookId: string,
  sourceId: string,
  values: { title?: string | undefined; selected?: boolean | undefined },
): Promise<Source | undefined> {
  const [row] = await db
    .update(sources)
    .set(values)
    .where(and(eq(sources.notebookId, notebookId), eq(sources.id, sourceId)))
    .returning();
  return row;
}

export async function setStatus(
  sourceId: string,
  status: SourceStatus,
  extra: Partial<Pick<Source, "statusStage" | "progress" | "errorMessage" | "indexedAt">> = {},
): Promise<void> {
  await db
    .update(sources)
    .set({ status, ...extra })
    .where(eq(sources.id, sourceId));
}

export async function deleteSource(notebookId: string, sourceId: string): Promise<boolean> {
  const rows = await db
    .delete(sources)
    .where(and(eq(sources.notebookId, notebookId), eq(sources.id, sourceId)))
    .returning({ id: sources.id });
  return rows.length > 0;
}

/** Every source id in the database, for reconciling against the vector store. */
export async function listAllSourceIds(): Promise<Set<string>> {
  const rows = await db.select({ id: sources.id }).from(sources);
  return new Set(rows.map((row) => row.id));
}
