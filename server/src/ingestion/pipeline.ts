import { extractorFor, ExtractionError } from "@/ingestion/extractors";
import { chunkBlocks } from "@/services/rag/chunker";
import { embeddingProvider } from "@/providers/embedding";
import { replaceChunksForSource, deleteChunksForSource } from "@/db/repositories/chunk.repository";
import { findSourceById, insertSource } from "@/db/repositories/source.repository";
import { getFile, putFile } from "@/db/repositories/source-file.repository";
import { setSourceStatus } from "@/services/status.service";
import { buildPoints, deleteBySource, upsertPoints } from "@/vector/chunk.vector-repository";
import { enqueueIngest } from "@/queues";
import { childLogger } from "@/lib/logger";
import type { SiblingSource } from "@/ingestion/extractors";
import type { Source } from "@/db/schema";

const log = childLogger("ingest");

export type IngestOutcome = { sourceId: string; chunkCount: number; siblingCount: number };

/**
 * Extract, chunk, embed, upsert, ready. The order matters: nothing is written to
 * the vector store until every embedding for the source has succeeded, so a
 * failure halfway leaves the source unqueryable rather than half answerable.
 */
export async function runIngestion(sourceId: string, reindex = false): Promise<IngestOutcome> {
  const source = await findSourceById(sourceId);

  if (!source) {
    log.warn({ sourceId }, "source no longer exists, dropping job");
    return { sourceId, chunkCount: 0, siblingCount: 0 };
  }

  if (reindex) {
    // FR-2.12. The old set goes before the new one is built, so a re-index can
    // never leave two generations of chunks answering the same question.
    await deleteBySource(source.id);
    await deleteChunksForSource(source.id);
  }

  const extracted = await extract(source);

  if (extracted.siblings && extracted.siblings.length > 0) {
    return expandPlaylist(source, extracted.siblings);
  }

  await setSourceStatus({
    sourceId: source.id,
    notebookId: source.notebookId,
    status: "CHUNKING",
    statusStage: "Splitting into chunks",
    progress: 45,
  });

  const chunks = await chunkBlocks(source.type, extracted.blocks);

  if (chunks.length === 0) {
    throw new ExtractionError("Nothing could be indexed from this source.");
  }

  const provider = embeddingProvider();

  await setSourceStatus({
    sourceId: source.id,
    notebookId: source.notebookId,
    status: "EMBEDDING",
    statusStage: `Generating embeddings for ${chunks.length} chunks`,
    progress: 65,
  });

  // Rows first, so each vector can carry the chunk id it belongs to.
  const rows = await replaceChunksForSource({
    sourceId: source.id,
    notebookId: source.notebookId,
    chunks,
    embeddingModel: provider.model,
    embeddingDim: provider.dimensions,
  });

  const vectors = await provider.embedDocuments(rows.map((row) => row.text));

  await setSourceStatus({
    sourceId: source.id,
    notebookId: source.notebookId,
    status: "EMBEDDING",
    statusStage: "Writing to the vector store",
    progress: 90,
  });

  await upsertPoints(buildPoints(source, rows, vectors));

  await setSourceStatus({
    sourceId: source.id,
    notebookId: source.notebookId,
    status: "READY",
    statusStage: null,
    progress: 100,
    indexedAt: new Date(),
  });

  log.info({ sourceId: source.id, chunks: rows.length }, "source indexed");
  return { sourceId: source.id, chunkCount: rows.length, siblingCount: 0 };
}

async function extract(source: Source) {
  await setSourceStatus({
    sourceId: source.id,
    notebookId: source.notebookId,
    status: "EXTRACTING",
    statusStage: "Reading the source",
    progress: 15,
  });

  const stored = await getFile(source.id, "original");
  const extractor = extractorFor(source.type);

  const result = await extractor.extract({
    sourceId: source.id,
    notebookId: source.notebookId,
    originalUrl: source.originalUrl,
    title: source.title,
    ...(stored ? { bytes: stored.bytes } : {}),
    onProgress: (stage, progress) =>
      setSourceStatus({
        sourceId: source.id,
        notebookId: source.notebookId,
        status: "EXTRACTING",
        statusStage: stage,
        // Extraction owns the first 40 percent of the bar.
        progress: Math.round(progress * 0.4),
      }),
  });

  // The captured reader view is what the web viewer renders later.
  if (result.captured) {
    await putFile({
      sourceId: source.id,
      kind: "captured",
      filename: result.captured.filename,
      mimeType: result.captured.mimeType,
      bytes: result.captured.bytes,
    });
  }

  return result;
}

/**
 * FR-2.5. A playlist row becomes a container: it holds no chunks of its own, and
 * each video becomes a sibling source that is ingested like any other.
 */
async function expandPlaylist(source: Source, siblings: SiblingSource[]): Promise<IngestOutcome> {
  let created = 0;

  for (const sibling of siblings) {
    try {
      const row = await insertSource({
        notebookId: source.notebookId,
        type: sibling.type,
        title: sibling.title,
        originalUrl: sibling.originalUrl,
        contentHash: sibling.contentHash,
        status: "QUEUED",
      });

      await enqueueIngest({ sourceId: row.id });
      created += 1;
    } catch {
      // A video already in the notebook trips the content hash constraint. That
      // is the duplicate rule working, not a failure of the playlist.
      log.debug({ url: sibling.originalUrl }, "playlist video already present, skipped");
    }
  }

  if (created === 0) {
    throw new ExtractionError("Every video in that playlist is already in this notebook.");
  }

  await setSourceStatus({
    sourceId: source.id,
    notebookId: source.notebookId,
    status: "READY",
    statusStage: null,
    progress: 100,
    indexedAt: new Date(),
  });

  return { sourceId: source.id, chunkCount: 0, siblingCount: created };
}
