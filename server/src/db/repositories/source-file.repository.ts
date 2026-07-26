import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceFiles } from "@/db/schema";
import type { SourceFile } from "@/db/schema";

export type SourceFileKind = "original" | "captured";

/**
 * Replaces what would otherwise be an object store. The interface is put, stat,
 * get and remove, so moving these bytes out to a real object store later means
 * rewriting this one file and nothing else.
 */
export async function putFile(input: {
  sourceId: string;
  kind: SourceFileKind;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<SourceFile> {
  // One artefact of each kind per source: re-indexing or re-capturing replaces
  // rather than accumulates.
  await db
    .delete(sourceFiles)
    .where(and(eq(sourceFiles.sourceId, input.sourceId), eq(sourceFiles.kind, input.kind)));

  const [row] = await db
    .insert(sourceFiles)
    .values({
      sourceId: input.sourceId,
      kind: input.kind,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      bytes: input.bytes,
    })
    .returning();

  if (!row) throw new Error("Insert returned no row");
  return row;
}

/** Metadata without the bytes, for listings and existence checks. */
export async function statFile(
  sourceId: string,
  kind: SourceFileKind,
): Promise<Omit<SourceFile, "bytes"> | undefined> {
  const [row] = await db
    .select({
      id: sourceFiles.id,
      sourceId: sourceFiles.sourceId,
      kind: sourceFiles.kind,
      filename: sourceFiles.filename,
      mimeType: sourceFiles.mimeType,
      sizeBytes: sourceFiles.sizeBytes,
      createdAt: sourceFiles.createdAt,
    })
    .from(sourceFiles)
    .where(and(eq(sourceFiles.sourceId, sourceId), eq(sourceFiles.kind, kind)))
    .limit(1);
  return row;
}

export async function getFile(
  sourceId: string,
  kind: SourceFileKind,
): Promise<SourceFile | undefined> {
  const [row] = await db
    .select()
    .from(sourceFiles)
    .where(and(eq(sourceFiles.sourceId, sourceId), eq(sourceFiles.kind, kind)))
    .limit(1);
  return row;
}

export async function removeFiles(sourceId: string): Promise<void> {
  await db.delete(sourceFiles).where(eq(sourceFiles.sourceId, sourceId));
}
