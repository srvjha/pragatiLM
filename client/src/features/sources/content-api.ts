import { apiFetch } from "@/lib/api-client";
import type { Locator } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/** What the viewer needs to render a source, shaped per type. */
export type SourceContent =
  | { kind: "pdf"; fileUrl: string; pageCount: number }
  | { kind: "text"; text: string }
  | { kind: "web"; html: string; originalUrl: string | null }
  | {
      kind: "timed";
      cues: { startSec: number; endSec: number; text: string }[];
      videoId?: string;
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

export type { Locator };
