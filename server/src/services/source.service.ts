import * as repo from "@/db/repositories/source.repository";
import { putFile, removeFiles } from "@/db/repositories/source-file.repository";
import { touchNotebook } from "@/db/repositories/notebook.repository";
import { enqueueIngest, enqueuePurge, enqueueReindex } from "@/queues";
import { hashBytes, hashText, hashUrl, canonicaliseUrl } from "@/lib/hash";
import { assertSafeUrl } from "@/lib/url-safety";
import { parseYoutubeUrl } from "@/lib/youtube";
import { sanitiseFilename } from "@/lib/upload";
import { conflict, notFound } from "@/lib/errors";
import { childLogger } from "@/lib/logger";
import type { Source, SourceType } from "@/db/schema";
import type { SourceDto } from "@/types/api";

const log = childLogger("source");

export function toDto(row: Source): SourceDto {
  return {
    id: row.id,
    notebookId: row.notebookId,
    type: row.type,
    title: row.title,
    status: row.status,
    statusStage: row.statusStage,
    progress: row.progress,
    errorMessage: row.errorMessage,
    selected: row.selected,
    originalUrl: row.originalUrl,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    indexedAt: row.indexedAt?.toISOString() ?? null,
  };
}

export async function listSources(notebookId: string): Promise<SourceDto[]> {
  return (await repo.listSources(notebookId)).map(toDto);
}

export async function getSource(notebookId: string, sourceId: string): Promise<SourceDto> {
  const row = await repo.findSource(notebookId, sourceId);
  if (!row) throw notFound("Source not found");
  return toDto(row);
}

async function assertNotDuplicate(notebookId: string, contentHash: string): Promise<void> {
  const existing = await repo.findByContentHash(notebookId, contentHash);

  if (existing) {
    // FR-2.15: the message names the source so the user can find it, rather than
    // just refusing.
    throw conflict(`This is already in the notebook as "${existing.title}".`, {
      existingSourceId: existing.id,
    });
  }
}

/**
 * The one path every source type funnels through: insert as QUEUED, then enqueue.
 * The row exists before the job so a worker can never pick up a job whose row is
 * not yet visible.
 */
async function createAndEnqueue(input: {
  notebookId: string;
  type: SourceType;
  title: string;
  contentHash: string;
  originalUrl?: string;
  requestId?: string;
  bytes?: { filename: string; mimeType: string; data: Buffer };
}): Promise<SourceDto> {
  await assertNotDuplicate(input.notebookId, input.contentHash);

  const row = await repo.insertSource({
    notebookId: input.notebookId,
    type: input.type,
    title: input.title,
    contentHash: input.contentHash,
    ...(input.originalUrl ? { originalUrl: input.originalUrl } : {}),
    status: "QUEUED",
  });

  if (input.bytes) {
    await putFile({
      sourceId: row.id,
      kind: "original",
      filename: input.bytes.filename,
      mimeType: input.bytes.mimeType,
      bytes: input.bytes.data,
    });
  }

  await touchNotebook(input.notebookId);
  await enqueueIngest({
    sourceId: row.id,
    ...(input.requestId ? { requestId: input.requestId } : {}),
  });

  log.info({ sourceId: row.id, type: input.type }, "source queued");
  return toDto(row);
}

export async function addPdf(
  notebookId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer },
  requestId?: string,
): Promise<SourceDto> {
  const filename = sanitiseFilename(file.originalname, "document.pdf");

  return createAndEnqueue({
    notebookId,
    type: "PDF",
    title: filename.replace(/\.pdf$/i, ""),
    contentHash: await hashBytes(file.buffer),
    ...(requestId ? { requestId } : {}),
    bytes: { filename, mimeType: "application/pdf", data: file.buffer },
  });
}

export async function addVtt(
  notebookId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer },
  requestId?: string,
): Promise<SourceDto> {
  const filename = sanitiseFilename(file.originalname, "transcript.vtt");

  return createAndEnqueue({
    notebookId,
    type: "VTT",
    title: filename.replace(/\.(vtt|srt)$/i, ""),
    contentHash: await hashBytes(file.buffer),
    ...(requestId ? { requestId } : {}),
    bytes: { filename, mimeType: "text/vtt", data: file.buffer },
  });
}

export async function addText(
  notebookId: string,
  input: { title?: string | undefined; content: string },
  requestId?: string,
): Promise<SourceDto> {
  const bytes = Buffer.from(input.content, "utf8");

  return createAndEnqueue({
    notebookId,
    type: "TEXT",
    title: input.title?.trim() || "Pasted text",
    contentHash: await hashText(input.content),
    ...(requestId ? { requestId } : {}),
    bytes: { filename: "pasted.txt", mimeType: "text/plain", data: bytes },
  });
}

export async function addWeb(
  notebookId: string,
  rawUrl: string,
  requestId?: string,
): Promise<SourceDto> {
  const url = await assertSafeUrl(rawUrl);

  return createAndEnqueue({
    notebookId,
    type: "WEB",
    // The real title comes from the page at extraction time; the host is a
    // readable placeholder until then.
    title: url.hostname.replace(/^www\./, ""),
    contentHash: await hashUrl(url),
    originalUrl: canonicaliseUrl(url),
    ...(requestId ? { requestId } : {}),
  });
}

export async function addYoutube(
  notebookId: string,
  rawUrl: string,
  requestId?: string,
): Promise<SourceDto> {
  const target = parseYoutubeUrl(rawUrl);
  const url = await assertSafeUrl(rawUrl);

  return createAndEnqueue({
    notebookId,
    type: "YOUTUBE",
    title:
      target.kind === "playlist"
        ? `YouTube playlist ${target.playlistId}`
        : `YouTube video ${target.videoId}`,
    contentHash: await hashUrl(url),
    originalUrl: canonicaliseUrl(url),
    ...(requestId ? { requestId } : {}),
  });
}

export async function updateSource(
  notebookId: string,
  sourceId: string,
  values: { title?: string | undefined; selected?: boolean | undefined },
): Promise<SourceDto> {
  // A title arriving through this path came from the person, so it is marked
  // as theirs and ingestion stops renaming the source from its content.
  const row = await repo.updateSource(notebookId, sourceId, {
    ...values,
    ...(values.title !== undefined ? { renamed: true } : {}),
  });
  if (!row) throw notFound("Source not found");
  return toDto(row);
}

export async function reindexSource(notebookId: string, sourceId: string): Promise<SourceDto> {
  const row = await repo.findSource(notebookId, sourceId);
  if (!row) throw notFound("Source not found");

  await repo.setStatus(row.id, "QUEUED", { statusStage: null, progress: 0, errorMessage: null });
  await enqueueReindex({ sourceId: row.id });

  return toDto({ ...row, status: "QUEUED", statusStage: null, progress: 0, errorMessage: null });
}

/**
 * The row and its bytes go in the same cascade, but Qdrant points are outside
 * the database transaction, so removing them is a retried job rather than part
 * of this request.
 */
export async function deleteSource(notebookId: string, sourceId: string): Promise<void> {
  const row = await repo.findSource(notebookId, sourceId);
  if (!row) throw notFound("Source not found");

  await enqueuePurge({ sourceId: row.id, notebookId, vectorIds: [] });
  await removeFiles(row.id);
  await repo.deleteSource(notebookId, sourceId);
  await touchNotebook(notebookId);
}
