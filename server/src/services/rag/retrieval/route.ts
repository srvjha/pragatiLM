import { z } from "zod";
import { env } from "@/config/env";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import { childLogger } from "@/lib/logger";
import type { Channel, RoutingDecision } from "./types";

const log = childLogger("retrieval:route");

/**
 * Which of the three routes a question should take. Heuristics first and the
 * model only when they are inconclusive, because the obvious cases are obvious
 * and a model call on every question would cost latency for nothing.
 */
const ALL_CHANNELS: Channel[] = ["VECTOR", "FTS"];

// A quoted phrase, an error code, a file name or an identifier is exactly what
// embeddings blur, so these force the keyword channel.
const KEYWORD_SIGNALS = [
  /"[^"]{2,}"/,
  /'[^']{2,}'/,
  /\b[A-Z]{2,}[0-9]{2,}\b/,
  /\b[A-Z_]{4,}\b/,
  /\b\w+\.(ts|js|tsx|py|go|rs|java|sql|json|yml|yaml|md|pdf)\b/,
  /\b(error|exception|code|status)\s+[0-9]{3}\b/i,
  /\berror\b.*\bcode\b/i,
];

// Counting, ordering and recency applied to the notebook rather than to its
// content. "How many videos" is a metadata question; "what does the video say"
// is not.
const SQL_SIGNALS = [
  /\bhow many\b/i,
  /\bhow much\b/i,
  /\bcount\b/i,
  /\b(number|total) of\b/i,
  /\bwhich (one|source|document|video|file)s? (is|are|has|have)\b.*\b(longest|shortest|largest|newest|oldest|biggest)\b/i,
  /\b(list|show) (all|my|the) (sources|documents|files|videos|notebooks)\b/i,
  /\bwhen did i (add|upload|import)\b/i,
  /\bwhat did i (add|upload|import)\b/i,
  /\b(added|uploaded|imported) (last|this) (week|month|year|night)\b/i,
];

const SUBJECT_WORDS = /\b(source|sources|document|documents|file|files|notebook|video|videos)\b/i;

const routeSchema = z.object({
  useVector: z.boolean().describe("Search the meaning of the sources. Almost always true."),
  useKeyword: z
    .boolean()
    .describe(
      "Search exact words. True when the question hinges on a specific term or identifier.",
    ),
  useSql: z
    .boolean()
    .describe(
      "Query notebook metadata. True only for questions about the collection itself, such as counts, sizes or dates. False for anything about what the sources say.",
    ),
  reason: z.string().describe("One short sentence explaining the choice."),
});

function heuristicChannels(question: string): { channels: Channel[]; reason: string } | null {
  const wantsSql =
    env.SQL_ROUTE_ENABLED &&
    SQL_SIGNALS.some((pattern) => pattern.test(question)) &&
    SUBJECT_WORDS.test(question);

  const wantsKeyword = KEYWORD_SIGNALS.some((pattern) => pattern.test(question));

  if (wantsSql) {
    return {
      // A metadata question still searches content, because "how many videos
      // cover sharding" needs both an exact count and the content that answers
      // the second half.
      channels: wantsKeyword ? ["VECTOR", "FTS", "SQL"] : ["VECTOR", "SQL"],
      reason:
        "The question asks about the notebook itself, so metadata is queried alongside content",
    };
  }

  if (wantsKeyword) {
    return {
      channels: ["VECTOR", "FTS"],
      reason: "The question hinges on an exact term, so keyword search runs alongside meaning",
    };
  }

  return null;
}

async function modelChannels(question: string): Promise<{ channels: Channel[]; reason: string }> {
  const model = chatModel("query", 0).withStructuredOutput(routeSchema, { name: "routing" });
  const decision = await model.invoke([
    {
      role: "system",
      content:
        "Decide which search routes answer a question about a user's own documents. Prefer meaning search. Use metadata only for questions about the collection rather than its contents.",
    },
    { role: "user", content: question },
  ]);

  const channels: Channel[] = [];
  if (decision.useVector) channels.push("VECTOR");
  if (decision.useKeyword) channels.push("FTS");
  if (decision.useSql && env.SQL_ROUTE_ENABLED) channels.push("SQL");

  return { channels, reason: decision.reason };
}

/**
 * FR-3.19: routing may only narrow. The notebook filter and the user's source
 * selection are applied inside each channel, below this decision, so nothing
 * here can widen scope past them.
 *
 * FR-3.20: an empty decision falls back to both content channels rather than
 * returning nothing.
 */
export async function routeQuery(
  question: string,
  selectedSourceIds: string[],
): Promise<RoutingDecision> {
  const fallback: RoutingDecision = {
    channels: ALL_CHANNELS,
    sourceTypes: [],
    sourceIds: selectedSourceIds,
    decidedBy: "fallback",
    reason: "Routing disabled or inconclusive, so both content channels run",
  };

  if (!env.QUERY_ROUTING_ENABLED) return fallback;

  const heuristic = heuristicChannels(question);
  if (heuristic) {
    return {
      channels: heuristic.channels,
      sourceTypes: [],
      sourceIds: selectedSourceIds,
      decidedBy: "heuristic",
      reason: heuristic.reason,
    };
  }

  if (!hasLlmCredentials()) return fallback;

  try {
    const decided = await modelChannels(question);
    if (decided.channels.length === 0) return fallback;

    return {
      channels: decided.channels,
      sourceTypes: [],
      sourceIds: selectedSourceIds,
      decidedBy: "model",
      reason: decided.reason,
    };
  } catch (error) {
    log.warn({ err: error }, "routing model call failed, falling back");
    return fallback;
  }
}
