import { apiFetch } from "@/lib/api-client";
import type { Locator } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type Cue = { startSec: number; endSec: number; text: string };

/**
 * A transcript language the viewer can switch to.
 *
 * `kind` is shown, because the three are not equally trustworthy: a native
 * track is what the video carries, a romanized one is the same words in
 * another script, and a translated one is a model's reading of them.
 */
export type CaptionTrack = {
  code: string;
  label: string;
  kind: "native" | "romanized" | "translated";
};

/** What the viewer needs to render a source, shaped per type. */
export type SourceContent =
  | { kind: "pdf"; fileUrl: string; pageCount: number }
  | { kind: "text"; text: string }
  | { kind: "web"; html: string; originalUrl: string | null }
  | {
      kind: "timed";
      cues: Cue[];
      /** An untimed transcript, when the caption route returned no timings. */
      paragraphs?: string[];
      videoId?: string;
      durationSec?: number;
      /** Absent when there is nothing to switch between. */
      tracks?: CaptionTrack[];
      /** The one the cues above came from. */
      track?: string | null;
    };

export function sourceContentUrl(notebookId: string, sourceId: string): string {
  return `${API_URL}/api/notebooks/${notebookId}/sources/${sourceId}/file`;
}

/**
 * The same file, shaped for react-pdf.
 *
 * Handing it a bare URL string makes it fetch without credentials, which under
 * authentication means every PDF comes back 401 and the viewer renders an
 * error. The object form is what carries the session cookie. A plain `href` on
 * a link does not need this, because a browser navigation sends the cookie by
 * itself.
 */
export function sourcePdfSource(
  notebookId: string,
  sourceId: string,
): { url: string; withCredentials: true } {
  return { url: sourceContentUrl(notebookId, sourceId), withCredentials: true };
}

export function fetchSourceContent(
  notebookId: string,
  sourceId: string,
): Promise<SourceContent> {
  return apiFetch<SourceContent>(
    `/notebooks/${notebookId}/sources/${sourceId}/content`,
  );
}

/**
 * One transcript in one language.
 *
 * Separate from the content request because a language nobody asked for should
 * not be paid for: the server downloads, romanises or translates a track only
 * when somebody switches to it, and caches the result.
 */
export function fetchCaptions(
  notebookId: string,
  sourceId: string,
  track: string,
): Promise<{ track: string; cues: Cue[] }> {
  return apiFetch<{ track: string; cues: Cue[] }>(
    `/notebooks/${notebookId}/sources/${sourceId}/captions?track=${encodeURIComponent(track)}`,
  );
}

export type { Locator };
