import { pdfExtractor } from "./pdf.extractor";
import { textExtractor } from "./text.extractor";
import { vttExtractor } from "./vtt.extractor";
import { webExtractor } from "./web.extractor";
import { youtubeExtractor } from "./youtube.extractor";
import type { Extractor } from "./types";
import type { SourceType } from "@/db/schema";

/**
 * The Strategy selection point. Five source types differ only in how bytes or a
 * URL become blocks with locators, so adding a sixth is a new file and one entry
 * here.
 */
const extractors: Record<SourceType, Extractor> = {
  PDF: pdfExtractor,
  TEXT: textExtractor,
  VTT: vttExtractor,
  WEB: webExtractor,
  YOUTUBE: youtubeExtractor,
};

export function extractorFor(type: SourceType): Extractor {
  return extractors[type];
}

export * from "./types";
export { createWebExtractor } from "./web.extractor";
export { createYoutubeExtractor } from "./youtube.extractor";
