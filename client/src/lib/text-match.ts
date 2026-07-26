/**
 * Locating a citation's quoted text inside a rendered document.
 *
 * A PDF locator names a page and nothing finer, so turning to the page is easy
 * and pointing at the sentence is not. What the citation does carry is the
 * quoted snippet, and that is what gets matched against the page's own text
 * layer here.
 *
 * Two things stop this from being a plain `indexOf`:
 *
 * The text layer is a list of fragments, not a string. pdf.js emits one item
 * per positioned run, which may be a word, part of a word, or a whole line, and
 * the highlight has to come back as a set of item indexes so each fragment can
 * be wrapped where it sits.
 *
 * The snippet is stored truncated. Citations keep the first 400 characters of
 * the chunk, which usually ends mid word, so an exact match on the whole
 * snippet frequently fails on text that is genuinely present. The fallback
 * drops trailing words until it finds the longest run that does match.
 */

const MIN_WORDS = 5;

/** Lowercase, collapse every run of whitespace to one space, trim. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

type Span = { start: number; end: number; index: number };

/**
 * The indexes of the text items covered by the snippet, or an empty set when
 * the snippet is not on this page.
 */
export function matchItems(items: string[], snippet: string): Set<number> {
  const marked = new Set<number>();
  const target = normalise(snippet);
  if (target.length === 0 || items.length === 0) return marked;

  // One buffer holding the page, plus where each item landed in it. Items are
  // joined with a space because pdf.js fragments are word-like and butting them
  // together would fuse the last word of one to the first of the next.
  const spans: Span[] = [];
  let buffer = "";

  items.forEach((item, index) => {
    const piece = normalise(item);
    if (piece.length === 0) return;

    if (buffer.length > 0) buffer += " ";
    spans.push({
      start: buffer.length,
      end: buffer.length + piece.length,
      index,
    });
    buffer += piece;
  });

  const found = locate(buffer, target);
  if (!found) return marked;

  for (const span of spans) {
    // Overlap, not containment: a fragment that holds only part of the match
    // still has to be highlighted.
    if (span.start < found.end && span.end > found.start)
      marked.add(span.index);
  }

  return marked;
}

/**
 * The longest prefix of the snippet present in the page, as a character range.
 *
 * Whole snippet first, since that is the common case. Failing that, words come
 * off the end one at a time: the truncation that broke the match is at the end,
 * so the front of the snippet is the part worth trusting.
 */
function locate(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  const direct = haystack.indexOf(needle);
  if (direct !== -1) return { start: direct, end: direct + needle.length };

  const words = needle.split(" ");

  for (let count = words.length - 1; count >= MIN_WORDS; count -= 1) {
    const candidate = words.slice(0, count).join(" ");
    const at = haystack.indexOf(candidate);
    if (at !== -1) return { start: at, end: at + candidate.length };
  }

  return null;
}
