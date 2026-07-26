import { env } from "@/config/env";
import { translateQuery } from "./translate";
import { routeQuery } from "./route";
import { searchAll } from "./search";
import { applyRelevanceFloor, reciprocalRankFusion } from "./fusion";
import { rerank } from "./rerank";
import { runSqlRoute } from "./sql-route";
import { childLogger } from "@/lib/logger";
import type { FactBlock, RetrievalRequest, RetrievalResult } from "./types";

const log = childLogger("retrieval");

/**
 * The facade. A caller asks for context for a question and gets an ordered set
 * of chunks plus any computed facts; translation, routing, fusion and reranking
 * stay behind this one call.
 *
 * The corrective loop wraps this. Keeping one pass separate from the retry
 * policy means the retry policy has one thing to decide: whether to run this
 * again with more query variants.
 */
export async function retrieveOnce(
  request: RetrievalRequest,
  extraVariants: { label: string; text: string }[] = [],
): Promise<RetrievalResult> {
  const timings: Record<string, number> = {};
  const clock = () => {
    const started = performance.now();
    return () => Math.round(performance.now() - started);
  };

  const translateDone = clock();
  const variants = [...(await translateQuery(request)), ...extraVariants];
  timings.translate = translateDone();

  const routeDone = clock();
  const routing = await routeQuery(request.question, request.sourceIds ?? []);
  timings.route = routeDone();

  const contentChannels = routing.channels.filter(
    (channel): channel is "VECTOR" | "FTS" => channel !== "SQL",
  );

  const scope = { notebookId: request.notebookId, sourceIds: request.sourceIds ?? [] };

  // The SQL route returns computed facts rather than ranked passages, so it runs
  // alongside the content channels rather than being fused with them.
  const searchDone = clock();
  const [lists, fact] = await Promise.all([
    searchAll(variants, contentChannels, scope),
    routing.channels.includes("SQL")
      ? runSqlRoute(request.question, request.notebookId)
      : Promise.resolve<FactBlock | null>(null),
  ]);
  timings.search = searchDone();

  const fuseDone = clock();
  const fused = reciprocalRankFusion(lists, env.RRF_K);
  timings.fuse = fuseDone();

  const floored = applyRelevanceFloor(fused.slice(0, env.RETRIEVAL_TOP_K), env.RELEVANCE_FLOOR);

  const rerankDone = clock();
  const reranked = await rerank(request.question, floored, env.RERANK_TOP_N);
  timings.rerank = rerankDone();

  const facts = fact ? [fact] : [];

  log.debug(
    {
      variants: variants.length,
      channels: routing.channels,
      fused: fused.length,
      reranked: reranked.length,
      facts: facts.length,
      timings,
    },
    "retrieval complete",
  );

  return {
    variants,
    routing,
    lists,
    fused,
    reranked,
    facts,
    // A fact with no passages is still an answer, so the empty path only fires
    // when neither produced anything.
    empty: reranked.length === 0 && facts.length === 0,
    timingsMs: timings,
  };
}
