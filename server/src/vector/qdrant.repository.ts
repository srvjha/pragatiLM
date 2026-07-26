import { qdrant } from "@/lib/clients/qdrant";
import { env } from "@/config/env";
import { childLogger } from "@/lib/logger";
import type { Locator } from "@/types/domain";

const log = childLogger("qdrant");

/**
 * Everything needed to render a citation without a second database round trip,
 * per FR-3.7.
 */
export type ChunkPayload = {
  notebookId: string;
  sourceId: string;
  sourceType: string;
  sourceTitle: string;
  chunkId: string;
  chunkIndex: number;
  locator: Locator;
  text: string;
  /** The embedding model that produced this vector. Filtered on at query time. */
  embeddingModel: string;
};

// Filtered on for every single retrieval call, so they are indexed rather than
// scanned. notebookId is the isolation boundary; sourceId scopes to the user's
// current selection.
const INDEXED_PAYLOAD_FIELDS = ["notebookId", "sourceId", "embeddingModel"] as const;

/**
 * Creates the collection and its payload indexes if they are missing. Safe to
 * call on every boot and from more than one process at once: a concurrent
 * creation returns a conflict, which is treated as success once the collection
 * is confirmed present.
 */
export async function ensureCollection(): Promise<void> {
  const name = env.QDRANT_COLLECTION;
  const { exists } = await qdrant.collectionExists(name);

  if (!exists) {
    try {
      await qdrant.createCollection(name, {
        vectors: { size: env.EMBEDDING_DIM, distance: "Cosine" },
      });
      log.info({ collection: name, dim: env.EMBEDDING_DIM }, "created qdrant collection");
    } catch (error) {
      const { exists: nowExists } = await qdrant.collectionExists(name);
      if (!nowExists) throw error;
      log.debug({ collection: name }, "collection created concurrently by another process");
    }
  }

  for (const field of INDEXED_PAYLOAD_FIELDS) {
    try {
      await qdrant.createPayloadIndex(name, {
        field_name: field,
        field_schema: "keyword",
        wait: true,
      });
    } catch {
      // Qdrant returns an error when the index already exists. There is no
      // "create if missing" form, and listing to check costs the same call, so
      // the redundant attempt is the cheapest idempotent path.
      log.debug({ field }, "payload index already present");
    }
  }
}

export async function countPoints(): Promise<number> {
  const result = await qdrant.count(env.QDRANT_COLLECTION, { exact: true });
  return result.count;
}
