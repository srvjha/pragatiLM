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

export function fetchSourceContent(
  notebookId: string,
  sourceId: string,
): Promise<SourceContent> {
  return apiFetch<SourceContent>(
    `/notebooks/${notebookId}/sources/${sourceId}/content`,
  );
}

export type { Locator };
