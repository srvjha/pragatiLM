"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CitationDto } from "@/types/api";

/**
 * FR-4.5 and FR-5.2. Markers written by the model as [1] become clickable pills
 * inline, so a claim and its evidence are one click apart rather than requiring
 * a hunt through the chips underneath.
 */
export function AnswerMarkdown({
  content,
  citations,
  onCite,
}: {
  content: string;
  citations: CitationDto[];
  onCite: (citation: CitationDto) => void;
}) {
  return (
    <div className="prose prose-sm dark:prose-invert prose-pre:bg-muted prose-pre:text-foreground max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p>{withMarkers(children, citations, onCite)}</p>
          ),
          li: ({ children }) => (
            <li>{withMarkers(children, citations, onCite)}</li>
          ),
          td: ({ children }) => (
            <td>{withMarkers(children, citations, onCite)}</td>
          ),
          a: ({ href, children }) => (
            // Untrusted links: never let a target page reach back through opener.
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const MARKER = /\[(\d+)\]/g;

function withMarkers(
  children: React.ReactNode,
  citations: CitationDto[],
  onCite: (citation: CitationDto) => void,
): React.ReactNode {
  return mapText(children, (text, key) => {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    MARKER.lastIndex = 0;

    while ((match = MARKER.exec(text)) !== null) {
      const index = Number(match[1]);
      const citation = citations.find((row) => row.markerIndex === index);

      if (cursor < match.index) parts.push(text.slice(cursor, match.index));

      if (citation) {
        parts.push(
          <button
            key={`${key}-${match.index}`}
            type="button"
            onClick={() => onCite(citation)}
            title={citation.snippet}
            aria-label={`Open citation ${index}`}
            className="bg-muted hover:bg-accent text-muted-foreground hover:text-foreground mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-baseline text-[10px] font-medium transition-colors"
          >
            {index}
          </button>,
        );
      } else {
        // The server strips unresolvable markers, so this only happens mid
        // stream, before the citations frame has arrived.
        parts.push(match[0]);
      }

      cursor = match.index + match[0].length;
    }

    if (cursor === 0) return text;
    if (cursor < text.length) parts.push(text.slice(cursor));

    return parts;
  });
}

/** Walks a React node tree applying a transform to every string leaf. */
function mapText(
  node: React.ReactNode,
  transform: (text: string, key: string) => React.ReactNode,
): React.ReactNode {
  if (typeof node === "string") return transform(node, "t");

  if (Array.isArray(node)) {
    return node.map((child, index) =>
      typeof child === "string" ? (
        <span key={index}>{transform(child, String(index))}</span>
      ) : (
        child
      ),
    );
  }

  return node;
}
