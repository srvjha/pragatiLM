import { sql } from "drizzle-orm";
import { qdrant } from "@/lib/clients/qdrant";
import { db } from "@/db/client";
import { env } from "@/config/env";
import { embeddingProvider } from "@/providers/embedding";
import { childLogger } from "@/lib/logger";
import type { Candidate, QueryVariant, RankedList } from "./types";
import type { Locator } from "@/types/domain";

const log = childLogger("retrieval:search");

/**
 * The two content channels. Both apply the notebook filter and the user's source
 * selection themselves, which is what makes isolation an invariant of retrieval
 * rather than something the caller has to remember (FR-1.6).
 */
const PER_VARIANT_LIMIT = 20;

type Scope = { notebookId: string; sourceIds: string[] };

/**
 * A tsquery matching any of the query's terms. The rewrite happens inside
 * Postgres on the output of websearch_to_tsquery, so the input is still parsed
 * and escaped by Postgres rather than by string handling here.
 */
const anyTerm = (text: string) =>
  sql`replace(websearch_to_tsquery('english', ${text})::text, ' & ', ' | ')::tsquery`;

function qdrantFilter(scope: Scope) {
  const must: Record<string, unknown>[] = [
    { key: "notebookId", match: { value: scope.notebookId } },
  ];

  if (scope.sourceIds.length > 0) {
    must.push({ key: "sourceId", match: { any: scope.sourceIds } });
  }

  return { must };
}

/** Dense search. One call per variant, all issued concurrently by the caller. */
export async function denseSearch(variant: QueryVariant, scope: Scope): Promise<RankedList> {
  const vector = await embeddingProvider().embedQuery(variant.text);

  const hits = await qdrant.query(env.QDRANT_COLLECTION, {
    query: vector,
    limit: PER_VARIANT_LIMIT,
    with_payload: true,
    filter: qdrantFilter(scope),
  });

  const candidates: Candidate[] = hits.points.map((point) => {
    const payload = point.payload as {
      chunkId: string;
      sourceId: string;
      sourceTitle: string;
      sourceType: string;
      chunkIndex: number;
      text: string;
      locator: Locator;
    };

    return {
      chunkId: payload.chunkId,
      sourceId: payload.sourceId,
      sourceTitle: payload.sourceTitle,
      sourceType: payload.sourceType,
      chunkIndex: payload.chunkIndex,
      text: payload.text,
      locator: payload.locator,
      score: point.score,
    };
  });

  return { channel: "VECTOR", variant: variant.label, candidates };
}

/**
 * Keyword search over the generated tsvector.
 *
 * `websearch_to_tsquery` parses the way people actually type, including quoted
 * phrases, but it joins the resulting terms with AND. A natural language
 * question then requires every one of its words in a single chunk, which almost
 * never happens: "what does it say about consensus and quorums" matched nothing
 * in a notebook that discusses both.
 *
 * The top level ANDs are rewritten to ORs, which is what makes this a recall
 * channel. Ranking is left to ts_rank_cd, which already scores a chunk
 * containing more of the terms higher. Phrase operators are untouched, so a
 * quoted string stays an exact phrase and precision is not lost.
 */
export async function keywordSearch(variant: QueryVariant, scope: Scope): Promise<RankedList> {
  const sourceFilter =
    scope.sourceIds.length > 0
      ? sql`AND c.source_id = ANY(${sql.raw(`ARRAY[${scope.sourceIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`
      : sql``;

  const result = await db.execute<{
    chunk_id: string;
    source_id: string;
    source_title: string;
    source_type: string;
    chunk_index: number;
    text: string;
    locator: Locator;
    rank: number;
  }>(sql`
    SELECT c.id AS chunk_id,
           c.source_id,
           s.title AS source_title,
           s.type::text AS source_type,
           c.chunk_index,
           c.text,
           c.locator,
           ts_rank_cd(c.tsv, ${anyTerm(variant.text)}) AS rank
    FROM chunks c
    JOIN sources s ON s.id = c.source_id
    WHERE c.notebook_id = ${scope.notebookId}
      ${sourceFilter}
      AND c.tsv @@ ${anyTerm(variant.text)}
    ORDER BY rank DESC
    LIMIT ${PER_VARIANT_LIMIT}
  `);

  const candidates: Candidate[] = result.rows.map((row) => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceType: row.source_type,
    chunkIndex: row.chunk_index,
    text: row.text,
    locator: row.locator,
    score: Number(row.rank),
  }));

  return { channel: "FTS", variant: variant.label, candidates };
}

/**
 * Every variant against every routed channel, concurrently. A channel that
 * throws yields an empty list rather than failing the question: a degraded
 * search beats no answer, and the trace records what was lost.
 */
export async function searchAll(
  variants: QueryVariant[],
  channels: ("VECTOR" | "FTS")[],
  scope: Scope,
): Promise<RankedList[]> {
  const jobs: Promise<RankedList>[] = [];

  for (const variant of variants) {
    for (const channel of channels) {
      const search = channel === "VECTOR" ? denseSearch : keywordSearch;

      jobs.push(
        search(variant, scope).catch((error: unknown) => {
          log.warn({ err: error, channel, variant: variant.label }, "channel failed");
          return { channel, variant: variant.label, candidates: [] };
        }),
      );
    }
  }

  return Promise.all(jobs);
}
