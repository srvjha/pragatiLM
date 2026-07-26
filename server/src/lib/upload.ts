import multer from "multer";
import sanitize from "sanitize-filename";
import { env } from "@/config/env";
import { payloadTooLarge, badRequest } from "@/lib/errors";

/**
 * NFR-10. Uploads are held in memory rather than on disk: the bytes go straight
 * into Postgres, so writing them to a temp file first would only add a path to
 * sanitise and a file to clean up.
 */
const MIME_BY_TYPE: Record<"PDF" | "VTT" | "TEXT", readonly string[]> = {
  PDF: ["application/pdf"],
  // Subtitle files are frequently served as text/plain or with no useful type at
  // all, so the extension is the reliable signal and is checked alongside.
  VTT: ["text/vtt", "application/x-subrip", "application/octet-stream", "text/plain"],
  TEXT: ["text/plain", "text/markdown", "application/octet-stream"],
};

const EXTENSIONS_BY_TYPE: Record<"PDF" | "VTT" | "TEXT", readonly string[]> = {
  PDF: [".pdf"],
  VTT: [".vtt", ".srt"],
  TEXT: [".txt", ".md", ".markdown"],
};

export const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

export function sanitiseFilename(filename: string, fallback: string): string {
  const cleaned = sanitize(filename).trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : fallback;
}

export function uploaderFor(type: "PDF" | "VTT" | "TEXT") {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: type === "PDF" ? 10 : 1 },
    fileFilter: (_req, file, callback) => {
      const extension = extensionOf(file.originalname);
      const mimeOk = MIME_BY_TYPE[type].includes(file.mimetype);
      const extensionOk = EXTENSIONS_BY_TYPE[type].includes(extension);

      // Both are weak signals on their own, so either one passing is enough,
      // but a file that matches neither is rejected.
      if (mimeOk || extensionOk) {
        callback(null, true);
        return;
      }

      callback(
        badRequest(
          `That file is not a ${type === "PDF" ? "PDF" : type === "VTT" ? "VTT or SRT" : "text"} file. Expected ${EXTENSIONS_BY_TYPE[type].join(" or ")}.`,
        ),
      );
    },
  });
}

/** multer reports its own limit failures with a code rather than a status. */
export function translateUploadError(error: unknown): unknown {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return payloadTooLarge(`Files are limited to ${env.MAX_UPLOAD_MB} MB.`);
    }
    if (error.code === "LIMIT_FILE_COUNT") return badRequest("Too many files in one upload.");
    return badRequest(error.message);
  }
  return error;
}
