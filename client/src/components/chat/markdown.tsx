"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CitationDto } from "@/types/api";
import { describeLocator } from "./citation-chips";

/**
 * A private use codepoint, appended to the text so the caret is parsed as part
 * of the last paragraph. Nothing else can produce it, so there is no text an
 * answer could contain that would be mistaken for a cursor.
 */
const CARET = "";

/**
 * FR-4.5 and FR-5.2. Markers written by the model as [1] become clickable pills
 * inline, so a claim and its evidence are one click apart rather than requiring
 * a hunt through the chips underneath.
 *
 * The answer is the one long-form reading surface in the product, so it is set
 * like one: the serif face at a real reading size, paragraphs given room, and
 * every structural element the model can emit — lists, tables, quotes, code —
 * styled in the paper palette rather than the plugin's own greys.
 */
export function AnswerMarkdown({
  content,
  citations,
  onCite,
  /** Draws a blinking caret after the final word, for an answer still arriving. */
  caret = false,
}: {
  content: string;
  citations: CitationDto[];
  onCite: (citation: CitationDto) => void;
  caret?: boolean;
}) {
  return (
    <div
      className={[
        // `prose-paper` rewires the plugin's colours to the theme tokens, which
        // is why there is no `prose-invert` here: the tokens already flip.
        "prose prose-paper max-w-none break-words",
        // The answer is material, not chrome, so it is set in the reading face
        // the rest of the product uses for source text. It was inheriting the
        // interface grotesque, which made an answer look like a dialog.
        "font-serif",
        // Nothing hangs off the top or bottom of a turn: the gap between turns
        // is the layout's job, not the first paragraph's.
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // Headings and code are the exceptions: a heading is the machine
        // labelling a section, and code is a locator-like literal. They are
        // kept close to the text they introduce, because a heading floating
        // equidistant between two blocks belongs to neither.
        "prose-headings:font-sans prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h1:text-[1.3em] prose-h2:text-[1.15em] prose-h3:text-[1.02em]",
        "prose-headings:mt-[1.7em] prose-headings:mb-[0.6em]",
        // An inline literal reads as a literal because it sits on a tint, not
        // because it is wrapped in backticks the plugin adds back as content.
        "prose-code:font-mono prose-code:text-[0.85em] prose-code:font-normal",
        "prose-code:bg-secondary prose-code:rounded-[3px] prose-code:px-1 prose-code:py-px",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-muted prose-pre:text-foreground prose-pre:font-mono prose-pre:text-[0.85em]",
        "prose-pre:border prose-pre:border-border prose-pre:rounded-md prose-pre:overflow-x-auto",
        "prose-a:text-foreground prose-a:decoration-border prose-a:underline-offset-[3px] hover:prose-a:decoration-foreground",
        // A quotation inside an answer is quoting a source, so it gets the
        // same left rule the viewer uses rather than Tailwind's default.
        "prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:not-italic prose-blockquote:font-normal",
        "prose-blockquote:text-muted-foreground prose-blockquote:py-px",
        "prose-strong:font-semibold prose-strong:text-foreground",
        // Tight enough that a list of claims reads as one thing rather than as
        // a series of separate paragraphs that happen to carry bullets.
        "prose-li:my-[0.35em] prose-li:pl-[0.15em] prose-ul:my-[1em] prose-ol:my-[1em]",
        "marker:text-muted-foreground",
        "prose-hr:my-[2em]",
        "prose-table:text-[0.92em] prose-th:font-sans prose-th:text-[0.8em]",
        "prose-th:uppercase prose-th:tracking-wide prose-th:text-muted-foreground",
        "prose-td:align-top",
      ].join(" ")}
    >
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
          // A wide table scrolls inside its own column rather than pushing the
          // transcript sideways and taking the composer with it.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            // Untrusted links: never let a target page reach back through opener.
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {caret ? `${content}${CARET}` : content}
      </ReactMarkdown>
    </div>
  );
}

const MARKER = /\[(\d+)\]/g;

/**
 * How many markers a single claim shows before the rest fold away.
 *
 * A closing sentence citing everything the answer used arrived as eight boxed
 * numbers in a row, which is not evidence anyone reads: it is a wall in the
 * middle of a paragraph, and it pushed the sentence it belonged to onto an
 * extra line. Three is enough to show a claim rests on several places; the
 * rest are one click away and the full set is always in the strip below.
 */
const RUN_LIMIT = 3;

/**
 * Styled as the affordance it is. A grey pill that happened to be clickable
 * told nobody it was: it carries the marker colour on hover, which is the same
 * colour the cited passage gets in the viewer, so the two read as the same
 * gesture.
 *
 * Sized in `em` and raised off the baseline rather than set in fixed pixels
 * with `align-super`, which pushed the marker clear of the line and opened a
 * gap above every sentence that cited anything. The margin is on the left
 * only, so a marker sits tight against the full stop that follows it.
 */
const MARKER_CLASS =
  "border-border bg-secondary text-muted-foreground hover:border-marker hover:bg-marker hover:text-marker-foreground focus-visible:ring-ring relative top-[-0.32em] ml-[0.12em] inline-flex h-[1.45em] min-w-[1.45em] cursor-pointer items-center justify-center rounded-[3px] border px-[0.28em] font-mono text-[0.62em] leading-none font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none";

/** The markers attached to one claim, kept on one line and capped. */
function MarkerRun({
  run,
  onCite,
}: {
  run: CitationDto[];
  onCite: (citation: CitationDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? run : run.slice(0, RUN_LIMIT);
  const hidden = run.length - shown.length;

  return (
    // Never broken across lines: a claim's evidence is one object. The word
    // joiner keeps it attached to the word it follows too, so a run cannot
    // wrap onto the next line on its own and open a sentence with a row of
    // numbers whose claim is above them.
    <span className="whitespace-nowrap">
      {"⁠"}
      {shown.map((citation) => (
        <button
          key={citation.markerIndex}
          type="button"
          onClick={() => onCite(citation)}
          title={`${citation.sourceTitle} — ${describeLocator(citation.locator)}. Click to see this passage in the source.`}
          aria-label={`Open the source for citation ${citation.markerIndex}, ${citation.sourceTitle}, ${describeLocator(citation.locator)}`}
          className={MARKER_CLASS}
        >
          {citation.markerIndex}
        </button>
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title={`This claim also cites ${hidden} more ${hidden === 1 ? "place" : "places"}`}
          aria-label={`Show ${hidden} more ${hidden === 1 ? "citation" : "citations"} for this claim`}
          className={MARKER_CLASS}
        >
          +{hidden}
        </button>
      )}
    </span>
  );
}

function withMarkers(
  children: React.ReactNode,
  citations: CitationDto[],
  onCite: (citation: CitationDto) => void,
): React.ReactNode {
  return mapText(children, (raw, key) => {
    // The caret always rides on the very end of the very last text node.
    const trailingCaret = raw.endsWith(CARET);
    const text = trailingCaret ? raw.slice(0, -CARET.length) : raw;

    const parts: React.ReactNode[] = [];
    let run: CitationDto[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    // Markers written back to back belong to the same claim, so they are
    // collected and rendered as one group rather than one by one.
    const flush = () => {
      if (run.length === 0) return;
      parts.push(
        <MarkerRun
          key={`${key}-run-${parts.length}`}
          run={run}
          onCite={onCite}
        />,
      );
      run = [];
    };

    MARKER.lastIndex = 0;

    while ((match = MARKER.exec(text)) !== null) {
      const index = Number(match[1]);
      const citation = citations.find((row) => row.markerIndex === index);

      if (cursor < match.index) {
        flush();
        parts.push(text.slice(cursor, match.index));
      }

      if (citation) {
        // A marker belongs to the word it follows, so it hugs it the way a
        // superscript reference does. The space the model writes before it is
        // dropped: it is a break opportunity, and left in it let a run wrap to
        // the next line and open a sentence with a row of numbers.
        const last = parts.length - 1;
        if (run.length === 0 && typeof parts[last] === "string") {
          parts[last] = (parts[last] as string).replace(/[ \t]+$/, "");
        }

        run.push(citation);
      } else {
        // The server strips unresolvable markers, so this only happens mid
        // stream, before the citations frame has arrived.
        flush();
        parts.push(match[0]);
      }

      cursor = match.index + match[0].length;
    }

    if (cursor === 0) return trailingCaret ? [text, caretNode(key)] : text;

    flush();

    if (cursor < text.length) parts.push(text.slice(cursor));
    if (trailingCaret) parts.push(caretNode(key));

    return parts;
  });
}

const caretNode = (key: string) => (
  <span key={`${key}-caret`} className="caret" aria-hidden />
);

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
