import type { FactBlock, FusedCandidate } from "@/services/rag/retrieval";

/**
 * Context blocks are numbered, and the model is told to cite by number. The
 * numbers are mapped back to real chunk ids server side, so a marker pointing at
 * a block that was never supplied can be stripped rather than believed.
 */
export const SYSTEM_PROMPT = [
  "You answer questions using only the numbered context blocks provided.",
  "",
  "Rules:",
  "- Attach a marker like [1] to every claim, naming the block it came from. Use several when a claim draws on several blocks, for example [1][3].",
  "- Never state anything the blocks do not support. Do not fill gaps from your own knowledge.",
  "- If the blocks do not answer the question, say so plainly and say what is missing. Do not guess.",
  "- A block marked (computed) is a value calculated from the notebook's records, not a quotation. Report it as a fact about the collection and never as something a source said.",
  "- Answer in markdown. Use tables, lists and code blocks where they help.",
  "- Lead with the answer in a sentence or two, then the supporting detail. Group related points into short paragraphs, or into a bulleted list when they are genuinely a list. Do not write one sentence per line.",
  "- Put a marker where the claim is made rather than collecting every marker at the end. A closing line carrying eight markers tells the reader nothing about which block supports what.",
  "- Be direct. Do not open by restating the question or describing what you are about to do.",
].join("\n");

export const NO_GROUNDED_ANSWER = [
  "I could not find this in your sources.",
  "",
  "Try rephrasing the question, selecting more sources in the rail, or adding material that covers it.",
].join("\n");

export function buildContextBlocks(
  candidates: FusedCandidate[],
  facts: FactBlock[],
): { text: string; blockCount: number } {
  const parts: string[] = [];
  let index = 0;

  for (const candidate of candidates) {
    index += 1;
    parts.push(
      `[${index}] ${candidate.sourceTitle}${describeLocator(candidate)}\n${candidate.text}`,
    );
  }

  for (const fact of facts) {
    index += 1;
    parts.push(
      `[${index}] (computed) ${fact.question}\n${JSON.stringify(fact.rows)}\nStatement: ${fact.statement}`,
    );
  }

  return { text: parts.join("\n\n"), blockCount: index };
}

/** A human readable position, so the model can say where something came from. */
function describeLocator(candidate: FusedCandidate): string {
  const locator = candidate.locator;

  switch (locator.kind) {
    case "pdf":
      return `, page ${locator.page}`;
    case "timed":
      return `, ${formatTime(locator.startSec)} to ${formatTime(locator.endSec)}`;
    case "web":
      return locator.headingPath.length > 0 ? `, ${locator.headingPath.join(" > ")}` : "";
    case "text":
      return "";
  }
}

function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function buildUserPrompt(question: string, context: string): string {
  return `Context blocks:\n\n${context}\n\nQuestion: ${question}`;
}
