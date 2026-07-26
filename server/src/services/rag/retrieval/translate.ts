import { z } from "zod";
import { env } from "@/config/env";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import { childLogger } from "@/lib/logger";
import type { QueryVariant, RetrievalRequest } from "./types";

const log = childLogger("retrieval:translate");

/**
 * The left side of the pipeline. A user's question is often a poor search key:
 * a follow up that means nothing standalone, a compound ask, or phrased in words
 * the sources never use.
 *
 * All variants come from one structured call rather than one call per technique,
 * so cost and latency do not grow with the number of techniques (NFR-13). HyDE
 * runs concurrently in its own call because a hypothetical passage and a
 * structured variant set are different tasks, and forcing them into one schema
 * produces a worse passage.
 */
const variantSchema = z.object({
  rewrite: z
    .string()
    .describe(
      "The question as a standalone search query, with pronouns and back references resolved from the conversation. Preserve the intent.",
    ),
  stepBack: z
    .string()
    .describe(
      "A broader, more general question whose answer gives background for the original. Empty string if the question is already general.",
    ),
  subQuestions: z
    .array(z.string())
    .describe(
      "The focused sub questions a compound question decomposes into. An empty array when the question asks exactly one thing.",
    ),
});

const TRANSLATE_SYSTEM = [
  "You prepare search queries for a retrieval system over a user's own documents.",
  "Rewrite the question so it stands alone without the conversation.",
  "Add one step back question that would retrieve useful background.",
  "Decompose only genuinely compound questions; return an empty array otherwise.",
  "Never answer the question. Produce search queries only.",
].join(" ");

const HYDE_SYSTEM = [
  "Write a short, factual passage of three to five sentences that answers the question",
  "as if it were an extract from a reference document the user already has.",
  "Write confidently in a neutral, encyclopedic register.",
  "Do not hedge, do not mention uncertainty, and do not address the reader.",
].join(" ");

function historyText(request: RetrievalRequest): string {
  // FR-3.9: the last four turns are enough to resolve a follow up, and more
  // would start to drag unrelated topics into the rewrite.
  const turns = (request.history ?? []).slice(-4);
  if (turns.length === 0) return "";
  return turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

async function generateVariants(request: RetrievalRequest): Promise<QueryVariant[]> {
  const model = chatModel("query", 0.2).withStructuredOutput(variantSchema, {
    name: "query_variants",
  });

  const history = historyText(request);
  const parsed = await model.invoke([
    { role: "system", content: TRANSLATE_SYSTEM },
    {
      role: "user",
      content: history
        ? `Conversation so far:\n${history}\n\nCurrent question: ${request.question}`
        : request.question,
    },
  ]);

  const variants: QueryVariant[] = [];

  if (env.REWRITE_ENABLED && parsed.rewrite.trim()) {
    variants.push({ label: "rewrite", text: parsed.rewrite.trim() });
  }

  if (env.STEPBACK_ENABLED && parsed.stepBack.trim()) {
    variants.push({ label: "stepBack", text: parsed.stepBack.trim() });
  }

  if (env.SUBQUESTIONS_ENABLED) {
    parsed.subQuestions
      .map((question) => question.trim())
      .filter(Boolean)
      .slice(0, env.SUBQUESTION_MAX)
      .forEach((question, index) => {
        variants.push({ label: `subQuestion${index + 1}`, text: question });
      });
  }

  return variants;
}

/**
 * A message's content is a string for a plain completion and an array of parts
 * otherwise. Stringifying the array directly yields "[object Object]", which
 * would become the HyDE passage and quietly poison the search.
 */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return (content as unknown[])
      .map((part) => {
        if (part === null || typeof part !== "object" || !("text" in part)) return "";
        const text = (part).text;
        return typeof text === "string" ? text : "";
      })
      .join("");
  }

  return "";
}

async function generateHyde(request: RetrievalRequest): Promise<QueryVariant | null> {
  // A slightly warmer temperature: the passage should read like prose, not like
  // a restatement of the question.
  const model = chatModel("query", 0.3);

  const response = await model.invoke([
    { role: "system", content: HYDE_SYSTEM },
    { role: "user", content: request.question },
  ]);

  const text = textOf(response.content).trim();
  return text.length > 0 ? { label: "hyde", text } : null;
}

/**
 * FR-3.14: the user's own wording is always kept, so a bad translation can never
 * remove it from the candidate set.
 *
 * FR-3.16: a failure, malformed output or a missing key degrades to the original
 * question alone. It is logged and never thrown, because a worse search is a far
 * better outcome than no answer.
 */
export async function translateQuery(request: RetrievalRequest): Promise<QueryVariant[]> {
  const original: QueryVariant = { label: "original", text: request.question };

  if (!env.QUERY_TRANSLATION_ENABLED || !hasLlmCredentials()) return [original];

  const [variantsResult, hydeResult] = await Promise.allSettled([
    generateVariants(request),
    env.HYDE_ENABLED ? generateHyde(request) : Promise.resolve(null),
  ]);

  const variants: QueryVariant[] = [original];

  if (variantsResult.status === "fulfilled") {
    variants.push(...variantsResult.value);
  } else {
    log.warn({ err: variantsResult.reason }, "query translation failed, using the original only");
  }

  if (hydeResult.status === "fulfilled" && hydeResult.value) {
    variants.push(hydeResult.value);
  } else if (hydeResult.status === "rejected") {
    log.warn({ err: hydeResult.reason }, "hyde generation failed");
  }

  return dedupe(variants);
}

/** A rewrite identical to the question is not worth a second search. */
function dedupe(variants: QueryVariant[]): QueryVariant[] {
  const seen = new Set<string>();

  return variants.filter((variant) => {
    const key = variant.text.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
