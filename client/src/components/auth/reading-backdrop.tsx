/**
 * The sign-in background: a page being read and marked.
 *
 * The obvious move for an AI product is a field of drifting particles or a
 * coloured aurora, and this design has no accent hue to make one out of. What
 * it does have is a single, specific gesture — the marker sweeping across the
 * passage an answer came from, with a locator beside it — and that gesture is
 * the entire product. So the backdrop is the interface's own behaviour at the
 * scale of wallpaper: lines of prose, reduced to the shape of prose, with
 * highlights arriving one after another and naming where they are.
 *
 * Everything is deterministic. Randomised widths would differ between the
 * server render and the client one, which is a hydration mismatch on the first
 * page a new visitor ever sees.
 */

/**
 * A page of text, described only by the shape of its lines. Widths vary the
 * way real paragraphs do, with the short line before a break, because a column
 * of identical bars reads as a loading skeleton rather than as a page.
 */
type Line = {
  width: string;
  /** A passage the product has matched, when this line carries one. */
  mark?: { left: string; width: string; label: string; delay: number };
};

const LINES: Line[] = [
  { width: "92%" },
  { width: "86%" },
  {
    width: "94%",
    mark: { left: "12%", width: "46%", label: "page 7", delay: 0 },
  },
  { width: "78%" },
  { width: "0%" },
  { width: "90%" },
  {
    width: "88%",
    mark: { left: "34%", width: "38%", label: "04:12", delay: 4 },
  },
  { width: "95%" },
  { width: "62%" },
  { width: "0%" },
  { width: "91%" },
  {
    width: "84%",
    mark: { left: "8%", width: "52%", label: "§ 2.1", delay: 8 },
  },
  { width: "93%" },
  { width: "70%" },
  { width: "0%" },
  { width: "89%" },
  {
    width: "96%",
    mark: { left: "44%", width: "34%", label: "1200–2100", delay: 12 },
  },
  { width: "58%" },
];

export function ReadingBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Ruled paper first, the same ground the landing hero uses, so arriving
          here reads as the same surface rather than a separate application. */}
      <div className="ruled absolute inset-0 opacity-40" />

      {/*
        Faded hard at the centre and the edges. The form sits in the middle and
        has to be the only thing anyone reads, so the backdrop is strongest
        exactly where nothing else is.
      */}
      <div className="absolute inset-0 [mask-image:radial-gradient(120%_90%_at_50%_45%,transparent_28%,black_78%)]">
        <div className="mx-auto flex h-full max-w-6xl flex-col justify-center gap-[1.15rem] px-6 py-16 opacity-[0.55] dark:opacity-[0.4]">
          {LINES.map((line, index) => (
            <div key={index} className="relative h-[0.4rem]">
              {/* An empty width is a paragraph break, which is what keeps the
                  column reading as prose rather than as a bar chart. */}
              {line.width !== "0%" && (
                <div
                  className="bg-foreground/[0.07] h-full rounded-full"
                  style={{ width: line.width }}
                />
              )}

              {line.mark && (
                <>
                  <div
                    className="sweep bg-marker/45 absolute inset-y-[-0.28rem] rounded-[2px]"
                    style={
                      {
                        left: line.mark.left,
                        width: line.mark.width,
                        "--sweep-delay": `${line.mark.delay}s`,
                      } as React.CSSProperties
                    }
                  />
                  {/* The locator, because a highlight with no address is just a
                      colour. This is the pair the whole product turns on. */}
                  <span
                    className="sweep-label text-muted-foreground absolute top-[-0.3rem] font-mono text-[0.6rem] tracking-wide"
                    style={
                      {
                        left: `calc(${line.mark.left} + ${line.mark.width} + 0.6rem)`,
                        "--sweep-delay": `${line.mark.delay}s`,
                      } as React.CSSProperties
                    }
                  >
                    {line.mark.label}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
