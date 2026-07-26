"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * The signature element: a citation drawn to the thing it cites.
 *
 * This is the product's whole claim in one picture, so it is the one place the
 * page spends any boldness. An answer names a marker; the marker is tied by a
 * line to the exact highlighted span in the source it came from. Everything
 * else on the page stays quiet.
 *
 * The line is measured from the real positions of the two elements rather than
 * drawn at fixed coordinates, so it stays attached when the type reflows at any
 * width. Below the large breakpoint the cards stack and the line is dropped
 * entirely: a connector that has to bend around a stacked layout stops reading
 * as a connection.
 */
export function TetherDemo() {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const answerCard = useRef<HTMLElement>(null);
  const target = useRef<HTMLSpanElement>(null);

  const [path, setPath] = useState<string | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const measure = useCallback(() => {
    const root = container.current;
    const from = marker.current;
    const to = target.current;
    const card = answerCard.current;
    if (!root || !from || !to || !card) return;

    const rootBox = root.getBoundingClientRect();
    const fromBox = from.getBoundingClientRect();
    const toBox = to.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();

    setBox({ width: rootBox.width, height: rootBox.height });

    // The line leaves the answer card's right edge, at the height of the marker
    // rather than from the marker itself. Starting at the marker means crossing
    // whatever text happens to sit to its right, and where a marker lands on a
    // line is decided by wrapping, which changes with the width and the font.
    // Leaving from the edge is unambiguous at every size.
    const x1 = cardBox.right - rootBox.left + 2;
    const y1 = fromBox.top + fromBox.height / 2 - rootBox.top;
    const x2 = toBox.left - rootBox.left - 6;
    const y2 = toBox.top + toBox.height / 2 - rootBox.top;

    // A single curve that leaves horizontally and arrives horizontally, so both
    // ends look attached rather than aimed.
    const bend = Math.max(36, Math.abs(x2 - x1) * 0.45);
    setPath(
      `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
    );
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;

    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener("resize", measure);

    // Web fonts land after first paint and move the text under the line.
    void document.fonts?.ready.then(measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <div ref={container} className="relative">
      {path && (
        <svg
          className="pointer-events-none absolute inset-0 hidden lg:block"
          width={box.width}
          height={box.height}
          aria-hidden
        >
          <path
            d={path}
            fill="none"
            stroke="var(--tether)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="4 4"
            className="tether-draw"
            opacity="0.7"
          />
        </svg>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] lg:items-center">
        {/* The answer. */}
        <figure
          ref={answerCard}
          className="bg-card rounded-lg border p-5 shadow-sm"
        >
          <figcaption className="text-muted-foreground mb-3 font-mono text-[0.7rem] tracking-wide uppercase">
            Your question
          </figcaption>
          <p className="text-muted-foreground mb-4 font-serif text-sm italic">
            What has to happen before a write is committed?
          </p>
          <div className="bg-border mb-4 h-px" />
          {/* The cited sentence ends the paragraph deliberately. The marker is
              where the tether starts, and anywhere else on the line it would
              have to cross the card's own text to get out. */}
          <p className="font-serif text-[0.95rem] leading-relaxed">
            A minority cannot commit on its own, which is what stops two halves
            of a split cluster from both accepting writes. A write is committed
            only once{" "}
            <span className="marked">
              a majority of nodes have acknowledged it
            </span>
            <span
              ref={marker}
              className="text-primary ml-0.5 align-super font-mono text-[0.65rem] font-medium"
            >
              [1]
            </span>
          </p>
        </figure>

        <div aria-hidden className="hidden lg:block" />

        {/* What it came from. */}
        <figure className="bg-card rounded-lg border p-5 shadow-sm">
          <figcaption className="text-muted-foreground mb-3 flex items-center justify-between font-mono text-[0.7rem] tracking-wide uppercase">
            <span className="truncate">consensus.pdf</span>
            <span className="tabular">page 7</span>
          </figcaption>
          <p className="font-serif text-[0.95rem] leading-relaxed">
            <span className="text-muted-foreground">
              ...the leader appends the entry to its own log and waits.{" "}
            </span>
            <span ref={target} className="marked">
              A majority of nodes have acknowledged it
            </span>
            <span className="text-muted-foreground">
              {" "}
              before the entry is considered committed and applied to the state
              machine...
            </span>
          </p>
        </figure>
      </div>

      <style>{`
        .tether-draw {
          stroke-dashoffset: 0;
        }
        @media (prefers-reduced-motion: no-preference) {
          .tether-draw {
            animation: tether-in 900ms ease-out 250ms both;
          }
          @keyframes tether-in {
            from { stroke-dashoffset: 240; opacity: 0; }
            to   { stroke-dashoffset: 0; opacity: 0.7; }
          }
        }
      `}</style>
    </div>
  );
}
