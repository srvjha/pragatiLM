import type { RequestHandler } from "express";
import { requireNotebook } from "@/middleware/ownership";
import { findSource } from "@/db/repositories/source.repository";
import { getFile } from "@/db/repositories/source-file.repository";
import { listChunksForSource } from "@/db/repositories/chunk.repository";
import { notFound, badRequest } from "@/lib/errors";
import { parseYoutubeUrl } from "@/lib/youtube";
import {
  CaptionError,
  cuesForTrack,
  indexedTrack,
  offeredTracks,
} from "@/services/captions.service";

/**
 * The viewer needs the source rendered, not retrieved, so this returns whole
 * content rather than chunks. Timed sources return their cues reassembled from
 * chunk locators, which is what lets the transcript highlight a cited range.
 */
export const getContent: RequestHandler = (req, res, next) => {
  const notebookId = requireNotebook(req).id;
  const sourceId = req.params.sourceId;

  if (typeof sourceId !== "string") {
    next(badRequest("sourceId is required"));
    return;
  }

  (async () => {
    const source = await findSource(notebookId, sourceId);
    if (!source) throw notFound("Source not found");

    switch (source.type) {
      case "PDF": {
        const stored = await getFile(source.id, "original");
        if (!stored) throw notFound("The original file is no longer available");

        return {
          kind: "pdf" as const,
          fileUrl: `/api/notebooks/${notebookId}/sources/${sourceId}/file`,
          pageCount: source.metadata.pageCount ?? 0,
        };
      }

      case "TEXT": {
        const stored = await getFile(source.id, "original");
        if (!stored) throw notFound("The original text is no longer available");

        // The same normalisation the extractor applied, so a character range
        // from a locator indexes the same string the viewer renders.
        const raw = stored.bytes.toString("utf8");
        return {
          kind: "text" as const,
          text: raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
        };
      }

      case "WEB": {
        const captured = await getFile(source.id, "captured");
        return {
          kind: "web" as const,
          // FR-5.9: the captured reader view, so the viewer works even if the
          // site has since changed or gone away.
          html: captured?.bytes.toString("utf8") ?? "",
          originalUrl: source.originalUrl,
        };
      }

      case "VTT":
      case "YOUTUBE": {
        const chunks = await listChunksForSource(source.id);
        const cues = chunks
          .filter((chunk) => chunk.locator.kind === "timed")
          .map((chunk) => ({
            startSec: chunk.locator.kind === "timed" ? chunk.locator.startSec : 0,
            endSec: chunk.locator.kind === "timed" ? chunk.locator.endSec : 0,
            text: chunk.text,
          }));

        // A route that returned no timings still returned a transcript, and
        // filtering to timed chunks dropped all of it: the viewer showed a
        // video with nothing beside it. Those chunks are passed through as
        // plain paragraphs, which cannot be clicked to seek but can be read.
        const paragraphs =
          cues.length === 0
            ? chunks.filter((chunk) => chunk.locator.kind === "text").map((chunk) => chunk.text)
            : [];

        const tracks = offeredTracks(
          source,
          chunks
            .slice(0, 8)
            .map((chunk) => chunk.text)
            .join(" ")
            .slice(0, 2000),
        );

        // A transcript with no timings still belongs to a video, and the video
        // is still worth watching. Falling back to the URL means every source
        // added before the metadata was being stored still shows its player,
        // without anyone having to re-index anything: the id is in the URL
        // either way, so reading it from there is not a guess.
        const videoId = source.metadata.videoId ?? videoIdFromUrl(source.originalUrl);

        return {
          kind: "timed" as const,
          cues,
          ...(paragraphs.length > 0 ? { paragraphs } : {}),
          ...(videoId ? { videoId } : {}),
          ...(source.metadata.durationSec ? { durationSec: source.metadata.durationSec } : {}),
          ...(tracks.length > 1 ? { tracks, track: indexedTrack(source) } : {}),
        };
      }
    }
  })()
    .then((data) => res.json({ data }))
    .catch(next);
};

/**
 * Enough of a transcript to tell what script it is written in.
 *
 * Which language a source was indexed in is recorded at ingestion, and every
 * source added before that was being stored has nothing. The text itself is a
 * more reliable answer than the metadata anyway, and it is already in Postgres.
 */
async function transcriptSample(sourceId: string): Promise<string> {
  const chunks = await listChunksForSource(sourceId);
  return chunks
    .slice(0, 8)
    .map((chunk) => chunk.text)
    .join(" ")
    .slice(0, 2000);
}

/** Throws on anything that is not a single video URL, which here means "no id". */
function videoIdFromUrl(url: string | null): string | undefined {
  if (!url) return undefined;

  try {
    const target = parseYoutubeUrl(url);
    return target.kind === "video" ? target.videoId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One transcript in one language.
 *
 * Separate from the content route because a language the reader has not asked
 * for should not be paid for: the indexed track comes back with the source,
 * and switching to another one downloads, romanises or translates it only at
 * the moment somebody wants it. The result is cached, so the second reader to
 * pick a language gets it immediately.
 */
export const getCaptions: RequestHandler = (req, res, next) => {
  const notebookId = requireNotebook(req).id;
  const sourceId = req.params.sourceId;
  const track = req.query.track;

  if (typeof sourceId !== "string" || typeof track !== "string" || track.length === 0) {
    next(badRequest("sourceId and track are required"));
    return;
  }

  (async () => {
    const source = await findSource(notebookId, sourceId);
    if (!source) throw notFound("Source not found");

    // The same sample the content route used, or the two routes disagree
    // about what is on offer: the switch would show Hinglish and this would
    // then reject the request for it.
    const offered = offeredTracks(source, await transcriptSample(source.id));
    if (!offered.some((entry) => entry.code === track)) {
      throw badRequest("That transcript language is not offered for this source");
    }

    return { track, cues: await cuesForTrack(source, track) };
  })()
    .then((data) => res.json({ data }))
    .catch((error: unknown) => {
      // A language that cannot be produced is a fact about the video, not a
      // fault in the request, and the viewer shows the message as it is.
      if (error instanceof CaptionError) {
        next(badRequest(error.message));
        return;
      }
      next(error);
    });
};

/** Streams the stored bytes, used by the PDF viewer and the download fallback. */
export const getFileStream: RequestHandler = (req, res, next) => {
  const notebookId = requireNotebook(req).id;
  const sourceId = req.params.sourceId;

  if (typeof sourceId !== "string") {
    next(badRequest("sourceId is required"));
    return;
  }

  (async () => {
    const source = await findSource(notebookId, sourceId);
    if (!source) throw notFound("Source not found");

    const stored = await getFile(source.id, "original");
    if (!stored) throw notFound("The original file is no longer available");

    res.setHeader("Content-Type", stored.mimeType);
    res.setHeader("Content-Length", String(stored.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(stored.filename)}"`,
    );
    res.send(stored.bytes);
  })().catch(next);
};
