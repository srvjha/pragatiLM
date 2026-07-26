import { randomUUID } from "node:crypto";
import { qdrant } from "@/lib/clients/qdrant";
import { env } from "@/config/env";
import { childLogger } from "@/lib/logger";
import type { ChunkPayload } from "./qdrant.repository";
import type { ChunkRow } from "@/db/repositories/chunk.types";
import type { Source } from "@/db/schema";

const log = childLogger("vector");

const UPSERT_BATCH = 256;

export type VectorPoint = { id: string; vector: number[]; payload: ChunkPayload };

export function buildPoints(
  source: Pick<Source, "id" | "notebookId" | "type" | "title">,
  chunks: ChunkRow[],
  vectors: number[][],
): VectorPoint[] {
  if (chunks.length !== vectors.length) {
    throw new Error(`Cannot pair ${chunks.length} chunks with ${vectors.length} vectors`);
  }

  return chunks.map((chunk, index) => {
    const vector = vectors[index];
    if (!vector) throw new Error(`Missing vector for chunk ${chunk.id}`);

    return {
      id: randomUUID(),
      vector,
      // FR-3.7: everything a citation needs, so rendering one does not require a
      // second database round trip.
      payload: {
        notebookId: source.notebookId,
        sourceId: source.id,
        sourceType: source.type,
        sourceTitle: source.title,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        locator: chunk.locator,
        text: chunk.text,
      },
    };
  });
}

/**
 * FR-3.8. Called only once every embedding for the source has succeeded, so a
 * partially indexed source can never leak into an answer.
 */
export async function upsertPoints(points: VectorPoint[]): Promise<void> {
  for (let index = 0; index < points.length; index += UPSERT_BATCH) {
    const batch = points.slice(index, index + UPSERT_BATCH);
    await qdrant.upsert(env.QDRANT_COLLECTION, { wait: true, points: batch });
  }
  log.debug({ count: points.length }, "upserted points");
}

export async function deleteBySource(sourceId: string): Promise<void> {
  await qdrant.delete(env.QDRANT_COLLECTION, {
    wait: true,
    filter: { must: [{ key: "sourceId", match: { value: sourceId } }] },
  });
}

export async function deleteByNotebook(notebookId: string): Promise<void> {
  await qdrant.delete(env.QDRANT_COLLECTION, {
    wait: true,
    filter: { must: [{ key: "notebookId", match: { value: notebookId } }] },
  });
}

export async function countBySource(sourceId: string): Promise<number> {
  const result = await qdrant.count(env.QDRANT_COLLECTION, {
    exact: true,
    filter: { must: [{ key: "sourceId", match: { value: sourceId } }] },
  });
  return result.count;
}

export async function countByNotebook(notebookId: string): Promise<number> {
  const result = await qdrant.count(env.QDRANT_COLLECTION, {
    exact: true,
    filter: { must: [{ key: "notebookId", match: { value: notebookId } }] },
  });
  return result.count;
}

/** Every sourceId currently holding points, for the reconciliation pass. */
export async function listIndexedSourceIds(): Promise<Set<string>> {
  const found = new Set<string>();
  let offset: string | number | undefined | null;

  do {
    const page = await qdrant.scroll(env.QDRANT_COLLECTION, {
      limit: 1000,
      with_payload: ["sourceId"],
      with_vector: false,
      ...(offset != null ? { offset } : {}),
    });

    for (const point of page.points) {
      const sourceId = (point.payload as { sourceId?: unknown } | null)?.sourceId;
      if (typeof sourceId === "string") found.add(sourceId);
    }

    offset = page.next_page_offset as string | number | null | undefined;
  } while (offset != null);

  return found;
}
