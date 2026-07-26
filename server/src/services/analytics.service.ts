import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { AnalyticsDto } from "@/types/api";

/**
 * Everything the dashboard shows, in one round trip and scoped to one user.
 *
 * Every query joins back to `notebooks.user_id`. There is no "all users" mode
 * and no way to ask for someone else's figures, because the same boundary that
 * applies to a notebook applies to counting them.
 *
 * The measures are chosen to answer questions worth acting on rather than to
 * fill a page. A refusal rate says whether the corpus covers what is being
 * asked of it. Citation coverage says whether answers are staying grounded.
 * Median correction rounds is the one the PRD calls out: a high median is a
 * defect in chunking or retrieval, not the loop doing its job.
 */
export async function getAnalytics(userId: string): Promise<AnalyticsDto> {
  const totalsResult = await db.execute<{
    notebooks: number;
    sources: number;
    ready_sources: number;
    failed_sources: number;
    chunks: number;
    tokens: number;
    stored_bytes: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM notebooks WHERE user_id = ${userId}) AS notebooks,
      (SELECT count(*)::int FROM sources s
         JOIN notebooks n ON n.id = s.notebook_id WHERE n.user_id = ${userId}) AS sources,
      (SELECT count(*)::int FROM sources s
         JOIN notebooks n ON n.id = s.notebook_id
        WHERE n.user_id = ${userId} AND s.status = 'READY') AS ready_sources,
      (SELECT count(*)::int FROM sources s
         JOIN notebooks n ON n.id = s.notebook_id
        WHERE n.user_id = ${userId} AND s.status = 'FAILED') AS failed_sources,
      (SELECT count(*)::int FROM chunks c
         JOIN notebooks n ON n.id = c.notebook_id WHERE n.user_id = ${userId}) AS chunks,
      (SELECT coalesce(sum(c.token_count), 0)::int FROM chunks c
         JOIN notebooks n ON n.id = c.notebook_id WHERE n.user_id = ${userId}) AS tokens,
      (SELECT coalesce(sum(f.size_bytes), 0)::bigint FROM source_files f
         JOIN sources s ON s.id = f.source_id
         JOIN notebooks n ON n.id = s.notebook_id WHERE n.user_id = ${userId}) AS stored_bytes
  `);

  const byType = await db.execute<{ type: string; count: number; ready: number }>(sql`
    SELECT s.type::text AS type,
           count(*)::int AS count,
           count(*) FILTER (WHERE s.status = 'READY')::int AS ready
      FROM sources s
      JOIN notebooks n ON n.id = s.notebook_id
     WHERE n.user_id = ${userId}
     GROUP BY s.type
     ORDER BY count(*) DESC
  `);

  // "Refused" is matched on the sentence the product actually produces, which
  // is the only marker of it on the message row.
  const answersResult = await db.execute<{
    questions: number;
    answered: number;
    refused: number;
    with_citations: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE m.role = 'user')::int AS questions,
      count(*) FILTER (WHERE m.role = 'assistant' AND m.status = 'complete')::int AS answered,
      count(*) FILTER (WHERE m.role = 'assistant'
                         AND m.content LIKE 'I could not find this in your sources%')::int AS refused,
      count(*) FILTER (WHERE m.role = 'assistant'
                         AND EXISTS (SELECT 1 FROM citations c WHERE c.message_id = m.id))::int
        AS with_citations
      FROM messages m
      JOIN chats ch ON ch.id = m.chat_id
      JOIN notebooks n ON n.id = ch.notebook_id
     WHERE n.user_id = ${userId}
  `);

  const retrievalResult = await db.execute<{
    runs: number;
    median_rounds: number;
    avg_context_grade: number;
    p50_latency_ms: number;
  }>(sql`
    SELECT
      count(*)::int AS runs,
      coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY retry_count), 0) AS median_rounds,
      coalesce(avg(context_grade), 0) AS avg_context_grade,
      coalesce(percentile_cont(0.5) WITHIN GROUP (
        ORDER BY (SELECT coalesce(sum(value::numeric), 0)
                    FROM jsonb_each_text(timings))), 0) AS p50_latency_ms
      FROM retrieval_runs r
      JOIN notebooks n ON n.id = r.notebook_id
     WHERE n.user_id = ${userId}
  `);

  const recent = await db.execute<{ day: string; sources: number; questions: number }>(sql`
    WITH days AS (
      SELECT generate_series(
        (current_date - interval '13 days')::date, current_date, interval '1 day'
      )::date AS day
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           (SELECT count(*)::int FROM sources s
              JOIN notebooks n ON n.id = s.notebook_id
             WHERE n.user_id = ${userId} AND s.created_at::date = d.day) AS sources,
           (SELECT count(*)::int FROM messages m
              JOIN chats ch ON ch.id = m.chat_id
              JOIN notebooks n ON n.id = ch.notebook_id
             WHERE n.user_id = ${userId} AND m.role = 'user' AND m.created_at::date = d.day)
             AS questions
      FROM days d
     ORDER BY d.day
  `);

  const artifactsResult = await db.execute<{ roadmaps: number; podcasts: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM roadmaps r
         JOIN notebooks n ON n.id = r.notebook_id WHERE n.user_id = ${userId}) AS roadmaps,
      (SELECT count(*)::int FROM podcasts p
         JOIN notebooks n ON n.id = p.notebook_id WHERE n.user_id = ${userId}) AS podcasts
  `);

  const totals = totalsResult.rows[0];
  const answers = answersResult.rows[0];
  const retrieval = retrievalResult.rows[0];
  const artifacts = artifactsResult.rows[0];
  const answered = answers?.answered ?? 0;

  return {
    notebooks: totals?.notebooks ?? 0,
    sources: {
      total: totals?.sources ?? 0,
      ready: totals?.ready_sources ?? 0,
      failed: totals?.failed_sources ?? 0,
      byType: byType.rows.map((row) => ({
        type: row.type,
        count: Number(row.count),
        ready: Number(row.ready),
      })),
    },
    index: {
      chunks: totals?.chunks ?? 0,
      tokens: totals?.tokens ?? 0,
      storedBytes: Number(totals?.stored_bytes ?? 0),
    },
    answers: {
      questions: answers?.questions ?? 0,
      answered,
      refused: answers?.refused ?? 0,
      withCitations: answers?.with_citations ?? 0,
      // Guarded: a fresh account has answered nothing, and 0/0 should read as
      // "no data yet" rather than as a perfect or a catastrophic score.
      citationCoverage: answered > 0 ? (answers?.with_citations ?? 0) / answered : null,
      refusalRate: answered > 0 ? (answers?.refused ?? 0) / answered : null,
    },
    retrieval: {
      runs: retrieval?.runs ?? 0,
      medianCorrectionRounds: Number(retrieval?.median_rounds ?? 0),
      averageContextGrade: Number(retrieval?.avg_context_grade ?? 0),
      medianLatencyMs: Math.round(Number(retrieval?.p50_latency_ms ?? 0)),
    },
    artifacts: {
      roadmaps: artifacts?.roadmaps ?? 0,
      podcasts: artifacts?.podcasts ?? 0,
    },
    activity: recent.rows.map((row) => ({
      day: row.day,
      sources: Number(row.sources),
      questions: Number(row.questions),
    })),
  };
}
