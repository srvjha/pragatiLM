"use client";

import { useCallback, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  sourceContentUrl,
  sourcePdfSource,
} from "@/features/sources/content-api";
import { matchItems } from "@/lib/text-match";
import type { Locator } from "@/types/api";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// The worker ships with the package; pointing at the local copy keeps the viewer
// working offline and avoids a CDN in the critical path.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * FR-5.5. Opens at the cited page and highlights the quoted text on it.
 *
 * The page comes from the locator; the highlight comes from the citation's
 * snippet, matched against the page's own text layer. When the snippet cannot
 * be found the page still turns, so a citation always lands somewhere useful
 * even if the marks do not appear.
 *
 * Opening a different citation remounts this component, because the viewer
 * keys it on the citation. That is why the current page is plain initial state
 * with no effect keeping it in sync: there is nothing to synchronise, the
 * component simply starts again at the new page.
 */
export function PdfView({
  notebookId,
  sourceId,
  locator,
  snippet,
}: {
  notebookId: string;
  sourceId: string;
  locator: Locator | null;
  snippet: string | null;
}) {
  const citedPage = locator?.kind === "pdf" ? locator.page : 1;

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(citedPage);
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());

  // The object form carries the session cookie. A bare URL string makes
  // react-pdf fetch without credentials, which under authentication is a 401.
  const file = useMemo(
    () => sourcePdfSource(notebookId, sourceId),
    [notebookId, sourceId],
  );

  // Only the cited page is searched. Highlighting the same words elsewhere in
  // the document would claim the answer came from somewhere it did not.
  const onGetTextSuccess = useCallback(
    (textContent: { items: unknown[] }) => {
      if (!snippet || page !== citedPage) {
        setMarked(new Set());
        return;
      }

      const strings = textContent.items.map((item) =>
        typeof item === "object" && item !== null && "str" in item
          ? String((item as { str: unknown }).str)
          : "",
      );

      setMarked(matchItems(strings, snippet));
    },
    [snippet, page, citedPage],
  );

  const customTextRenderer = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) =>
      marked.has(itemIndex)
        ? `<mark class="marked marked-active">${escapeHtml(str)}</mark>`
        : escapeHtml(str),
    [marked],
  );

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-muted-foreground text-sm">
          This PDF could not be rendered here.
        </p>
        <a
          href={sourceContentUrl(notebookId, sourceId)}
          download
          className="hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors"
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

        <span className="text-muted-foreground min-w-20 text-center font-mono text-xs tabular-nums">
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

        {marked.size > 0 && (
          <span className="text-muted-foreground ml-2 text-xs">
            Cited passage highlighted
          </span>
        )}
      </div>

      <div className="bg-muted/40 min-h-0 flex-1 overflow-auto p-3">
        <Document
          file={file}
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
            key={`${page}-${marked.size}`}
            pageNumber={page}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer={false}
            onGetTextSuccess={onGetTextSuccess}
            customTextRenderer={customTextRenderer}
            className="shadow"
          />
        </Document>
      </div>
    </div>
  );
}

/**
 * customTextRenderer's return value is injected as HTML, so the page's own text
 * has to be escaped. A PDF containing a literal "<script>" is otherwise running
 * it in the viewer.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
