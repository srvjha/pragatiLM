import { extractorFor, ExtractionError } from "@/ingestion/extractors";
import { chunkBlocks } from "@/services/rag/chunker";
import { embeddingProvider } from "@/providers/embedding";
import { replaceChunksForSource, deleteChunksForSource } from "@/db/repositories/chunk.repository";
import { findSourceById, insertSource, updateSource } from "@/db/repositories/source.repository";
import { getFile, putFile } from "@/db/repositories/source-file.repository";
import { setSourceStatus } from "@/services/status.service";
import { buildPoints, deleteBySource, upsertPoints } from "@/vector/chunk.vector-repository";
import { enqueueIngest } from "@/queues";
import { childLogger } from "@/lib/logger";
import { devanagariRatio } from "@/lib/devanagari";
import { hasLlmCredentials } from "@/providers/llm";
import { translateTexts, TRANSLATED_ENGLISH } from "@/services/captions.service";
import type { SiblingSource } from "@/ingestion/extractors";
import type { Source } from "@/db/schema";
import type { Chunk } from "@/services/rag/chunker/types";

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

  const title = await nameFromContent(source, extracted.title);

  // Every extractor has always returned this and nothing ever stored it, so
  // the column held `{}` for every source ever ingested. It is not decoration:
  // it carries the page count the PDF viewer sizes itself from, the caption
  // tracks the language switch is built out of, and the video id without which
  // a YouTube source renders as a transcript with no video above it.
  //
  // Merged rather than replaced, so a field written by an earlier stage is not
  // lost when a re-index produces a metadata object without it.
  if (Object.keys(extracted.metadata).length > 0) {
    await updateSource(source.notebookId, source.id, {
      metadata: { ...source.metadata, ...extracted.metadata },
    });
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

  const translated = await translateForSearch(source, chunks);

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
    chunks: translated,
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

  // Built from the name the source ended up with, not the one it was created
  // with. Every chunk carries its source's title into the vector store so a
  // citation can be rendered without a second round trip, and the row object
  // here predates the rename above: a YouTube source was writing "YouTube
  // video OML7…" onto all of its chunks, so every citation in every answer
  // named the video by its id while the rail showed the real title.
  await upsertPoints(buildPoints({ ...source, title }, rows, vectors));

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

/**
 * Below this the transcript is English with the odd Hindi phrase in it, and
 * translating the whole thing would be worse than leaving it alone.
 */
const TRANSLATE_ABOVE = 0.4;

/**
 * Translates a Devanagari transcript before it is indexed.
 *
 * A question in English against a Devanagari corpus does not retrieve badly,
 * it does not retrieve at all. The keyword channel is looking for a string
 * that is not present in any form, and the vector channel is comparing an
 * English question to Devanagari spellings. On one 33 chunk video, "API
 * gateway" appeared once as एपीआई गेटवे and zero times in Latin script, so the
 * search had nothing to find and the product refused a question the video
 * spends four minutes answering.
 *
 * Translating after chunking rather than before is the whole trick: the
 * locators are already fixed by then, so a citation still opens the exact
 * second it always did, and only the text being embedded changes.
 *
 * The cost is honest and worth stating: what gets stored, and therefore what a
 * citation quotes, is a machine translation rather than the verbatim caption.
 * The original is not lost — the viewer's language switch fetches the Hindi
 * track back from YouTube, and Hinglish is derived from that — but the quoted
 * snippet is a reading of the source rather than the source.
 */
async function translateForSearch(source: Source, chunks: Chunk[]): Promise<Chunk[]> {
  if (!hasLlmCredentials()) return chunks;

  const sample = chunks
    .slice(0, 8)
    .map((chunk) => chunk.text)
    .join(" ");

  if (devanagariRatio(sample) < TRANSLATE_ABOVE) return chunks;

  try {
    const english = await translateTexts(chunks.map((chunk) => chunk.text));

    // Recorded so the viewer opens on the translation and marks it as one,
    // and so the language switch offers the Hindi track to go back to.
    await updateSource(source.notebookId, source.id, {
      metadata: { ...source.metadata, captionLanguage: TRANSLATED_ENGLISH },
    });

    log.info({ sourceId: source.id, chunks: chunks.length }, "indexed the English translation");

    return chunks.map((chunk, index) => ({ ...chunk, text: english[index] ?? chunk.text }));
  } catch (error) {
    // A failed translation must not fail the source. Indexing the Devanagari
    // is worse for an English question and still better than no source.
    log.warn({ err: error, sourceId: source.id }, "translation failed, indexing as extracted");
    return chunks;
  }
}

/**
 * Renames the row to what the content turned out to be called, and returns the
 * name to use from here on.
 *
 * The extractor is the first thing that knows: a YouTube URL is added before
 * anything has fetched the video, so the row starts life named after its own id.
 *
 * A title the person chose is never overwritten. `renamed` is set when they edit
 * it, so a deliberate name survives a re-index.
 */
async function nameFromContent(source: Source, extracted: string | undefined): Promise<string> {
  if (!extracted || source.renamed || extracted === source.title) return source.title;

  await updateSource(source.notebookId, source.id, { title: extracted });
  log.info({ sourceId: source.id, title: extracted }, "named the source from its content");

  return extracted;
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

  let result;
  try {
    result = await extractor.extract({
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
  } catch (error) {
    // A source that failed still deserves its name. The failure is what the
    // person is looking at, and deciding whether to retry it, so an id where the
    // title should be is the least useful thing to show them.
    if (error instanceof ExtractionError) {
      await nameFromContent(source, error.title);
    }
    throw error;
  }

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
