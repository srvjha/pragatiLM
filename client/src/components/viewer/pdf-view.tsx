"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sourceContentUrl } from "@/features/sources/content-api";
import type { Locator } from "@/types/api";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// The worker ships with the package; pointing at the local copy keeps the viewer
// working offline and avoids a CDN in the critical path.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** FR-5.5. Opens at the cited page, with page navigation and zoom. */
export function PdfView({
  notebookId,
  sourceId,
  locator,
}: {
  notebookId: string;
  sourceId: string;
  locator: Locator | null;
}) {
  const citedPage = locator?.kind === "pdf" ? locator.page : 1;

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(citedPage);
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-muted-foreground text-sm">
          This PDF could not be rendered here.
        </p>
        <a
          href={sourceContentUrl(notebookId, sourceId)}
          download
          className="hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
        >
          Download the original
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-1 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <span className="text-muted-foreground min-w-20 text-center text-xs tabular-nums">
          {page} of {pageCount || "?"}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Next page"
          disabled={pageCount > 0 && page >= pageCount}
          onClick={() =>
            setPage((current) =>
              Math.min(pageCount || current + 1, current + 1),
            )
          }
        >
          <ChevronRight className="size-4" />
        </Button>

        <span className="bg-border mx-1 h-4 w-px" />

        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Zoom out"
          onClick={() => setScale((current) => Math.max(0.5, current - 0.25))}
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Zoom in"
          onClick={() => setScale((current) => Math.min(2.5, current + 0.25))}
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>

      <div className="bg-muted/40 min-h-0 flex-1 overflow-auto p-3">
        <Document
          file={sourceContentUrl(notebookId, sourceId)}
          onLoadSuccess={(document) => setPageCount(document.numPages)}
          onLoadError={() => setFailed(true)}
          loading={
            <p className="text-muted-foreground p-4 text-sm">
              Loading the document...
            </p>
          }
          className="flex justify-center"
        >
          <Page
            pageNumber={page}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer={false}
            className="shadow"
          />
        </Document>
      </div>
    </div>
  );
}
