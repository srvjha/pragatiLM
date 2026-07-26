import { Innertube } from "youtubei.js";
import { sha256 } from "hash-wasm";
import { parseYoutubeUrl } from "@/lib/youtube";
import { fetchYoutubeCaptions, hasYtDlp } from "@/lib/ytdlp";
import { childLogger } from "@/lib/logger";
import {
  ExtractionError,
  type Extractor,
  type ExtractorInput,
  type ExtractionResult,
} from "./types";
import type { Block, SiblingSource } from "./types";

/**
 * Captions only. Whisper style transcription of a video with no caption track is
 * explicitly out of scope, so that case fails with a message saying so rather
 * than silently producing nothing.
 */
export type Cue = { text: string; startSec: number; endSec: number };

export type VideoTranscript = {
  title: string;
  author?: string;
  durationSec?: number;
  cues: Cue[];
};

export type YoutubeClient = {
  fetchTranscript: (videoId: string) => Promise<VideoTranscript>;
  fetchPlaylist: (playlistId: string) => Promise<{ title: string; videoIds: string[] }>;
};

const log = childLogger("youtube");

let innertube: Promise<Innertube> | null = null;

function client(): Promise<Innertube> {
  // The player must be retrieved. Skipping it is faster and returns an info
  // object whose caption_tracks array is simply empty, which made every video
  // look like it had no captions at all: this one reports three tracks with the
  // player and zero without. The diagnosis below depends on knowing the
  // difference between a video with no captions and one whose captions YouTube
  // will not hand over.
  innertube ??= Innertube.create();
  return innertube;
}

export const liveYoutubeClient: YoutubeClient = {
  async fetchTranscript(videoId: string): Promise<VideoTranscript> {
    const youtube = await client();

    let info;
    try {
      info = await youtube.getInfo(videoId);
    } catch {
      throw new ExtractionError("That video could not be loaded. It may be private or removed.");
    }

    // Whether the video HAS captions and whether YouTube will SERVE them are
    // two different questions, and conflating them produced a message that was
    // simply false: a video with a caption track was reported as having
    // captions disabled, which sent people looking for a setting to change on
    // a video they may not even own.
    const tracks = info.captions?.caption_tracks ?? [];

    if (tracks.length === 0) {
      throw new ExtractionError(
        "This video has no captions. Upload a VTT or SRT transcript for it instead.",
      );
    }

    const title = info.basic_info.title ?? `YouTube video ${videoId}`;
    const extras = {
      ...(info.basic_info.author ? { author: info.basic_info.author } : {}),
      ...(info.basic_info.duration ? { durationSec: info.basic_info.duration } : {}),
    };

    // yt-dlp first when it is installed. YouTube's own transcript API answers
    // 400 for everything now, so trying it first would only add a doomed round
    // trip to the common path.
    if (await hasYtDlp()) {
      try {
        const cues = await fetchYoutubeCaptions(`https://www.youtube.com/watch?v=${videoId}`);
        if (cues.length > 0) return { title, ...extras, cues };
        log.warn({ videoId }, "yt-dlp returned no cues, falling back");
      } catch (error) {
        log.warn({ err: error, videoId }, "yt-dlp failed, falling back");
      }
    }

    let transcript;
    try {
      transcript = await info.getTranscript();
    } catch {
      // The track exists and YouTube still refuses to hand it over. This is
      // their side, not a setting on the video, so the message says so and
      // points at the route that does work.
      const languages = tracks
        .map((track) => String(track.name?.text ?? track.language_code ?? "").trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");

      const installed = await hasYtDlp();

      throw new ExtractionError(
        `YouTube would not release the captions for this video${
          languages ? ` (it has: ${languages})` : ""
        }. This is a restriction on their side, not a setting on the video. ` +
          (installed
            ? "Fetching them another way also failed, which usually means YouTube is rate limiting this machine. Wait a few minutes and press Retry, or add the transcript as a VTT or SRT source."
            : "Installing yt-dlp on the server lets this work automatically. Until then, download the transcript yourself and add it here as a VTT or SRT source."),
      );
    }

    const segments = transcript.transcript.content?.body?.initial_segments ?? [];

    const cues: Cue[] = segments
      .map((segment) => ({
        text: String(segment.snippet.text ?? "").trim(),
        startSec: Number(segment.start_ms) / 1000,
        endSec: Number(segment.end_ms) / 1000,
      }))
      .filter((cue) => cue.text.length > 0);

    if (cues.length === 0) {
      throw new ExtractionError(
        "This video has no caption track. Upload a VTT or SRT transcript for it instead.",
      );
    }

    return { title, ...extras, cues };
  },

  async fetchPlaylist(playlistId: string): Promise<{ title: string; videoIds: string[] }> {
    const youtube = await client();

    try {
      const playlist = await youtube.getPlaylist(playlistId);
      const videoIds = playlist.videos
        .map((video) => ("id" in video ? String(video.id) : ""))
        .filter(Boolean);

      return { title: playlist.info.title ?? `Playlist ${playlistId}`, videoIds };
    } catch {
      throw new ExtractionError("That playlist could not be loaded. It may be private.");
    }
  },
};

export function createYoutubeExtractor(api: YoutubeClient = liveYoutubeClient): Extractor {
  return {
    type: "YOUTUBE",

    async extract(input: ExtractorInput): Promise<ExtractionResult> {
      if (!input.originalUrl) {
        throw new ExtractionError("This YouTube source has no URL.");
      }

      const target = parseYoutubeUrl(input.originalUrl);

      // FR-2.5. A playlist row produces no blocks of its own: it expands into one
      // sibling source per video, and each of those is ingested normally.
      if (target.kind === "playlist") {
        const playlist = await api.fetchPlaylist(target.playlistId);

        if (playlist.videoIds.length === 0) {
          throw new ExtractionError("That playlist has no videos.");
        }

        const siblings: SiblingSource[] = [];
        for (const videoId of playlist.videoIds) {
          const url = `https://www.youtube.com/watch?v=${videoId}`;
          siblings.push({
            type: "YOUTUBE",
            title: `YouTube video ${videoId}`,
            originalUrl: url,
            contentHash: await sha256(url),
          });
        }

        return { title: playlist.title, blocks: [], metadata: {}, siblings };
      }

      const video = await api.fetchTranscript(target.videoId);
      await input.onProgress?.("Reading captions", 60);

      const blocks: Block[] = video.cues.map((cue) => ({
        text: cue.text,
        locator: { kind: "timed", startSec: cue.startSec, endSec: cue.endSec },
      }));

      return {
        title: video.title,
        blocks,
        metadata: {
          videoId: target.videoId,
          cueCount: blocks.length,
          ...(video.author ? { author: video.author } : {}),
          ...(video.durationSec !== undefined
            ? { durationSec: video.durationSec }
            : { durationSec: Math.round(video.cues[video.cues.length - 1]?.endSec ?? 0) }),
        },
      };
    },
  };
}

export const youtubeExtractor = createYoutubeExtractor();
