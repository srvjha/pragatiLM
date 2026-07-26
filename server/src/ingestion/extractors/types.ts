import type { Locator, SourceMetadata } from "@/types/domain";
import type { SourceType } from "@/db/schema";

/**
 * One block is the smallest unit that still knows where it came from. Chunking
 * merges and splits these, carrying the locator through, so a citation can
 * always resolve back to a page, a character range or a timestamp.
 */
export type Block = { text: string; locator: Locator };

/** A playlist yields one of these per video, each becoming its own source. */
export type SiblingSource = {
  type: SourceType;
  title: string;
  originalUrl: string;
  contentHash: string;
};

export type ExtractionResult = {
  /** Replaces the placeholder title on the source row when the real one is known. */
  title?: string;
  blocks: Block[];
  metadata: SourceMetadata;
  /**
   * The reader view of a web page, stored so the viewer works if the site later
   * goes down and so that what the model read is what the user sees.
   */
  captured?: { filename: string; mimeType: string; bytes: Buffer };
  siblings?: SiblingSource[];
};

export type ExtractorInput = {
  sourceId: string;
  notebookId: string;
  originalUrl: string | null;
  title: string;
  /** The stored bytes, for the types that have any. */
  bytes?: Buffer;
  onProgress?: (stage: string, progress: number) => Promise<void>;
};

export interface Extractor {
  readonly type: SourceType;
  extract(input: ExtractorInput): Promise<ExtractionResult>;
}

/**
 * Thrown when a source cannot be extracted for a reason the user can act on.
 * The message reaches the failed row verbatim, so it is written for them, not
 * for a log.
 */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}
