import { z } from "zod";
import { env } from "@/config/env";
import { getReadOnlyPool } from "@/db/client";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import { childLogger } from "@/lib/logger";
import type { FactBlock } from "./types";

const log = childLogger("retrieval:sql");

/**
 * Generated SQL runs against the user's own database, so every guard here is a
 * requirement rather than good practice. The load bearing one is not in this
 * file: the statement executes through a role that holds SELECT on three
 * relations and nothing else, in a read only transaction, so a write is refused
 * by Postgres whatever this inspection misses.
 */

/**
 * The only schema the generator ever sees. Chunk text, messages, citations and
 * stored file bytes are deliberately absent: this route answers questions about
 * the notebook, not about what is in it.
 */
const SCHEMA_DESCRIPTION = `
notebooks(id uuid, name text, created_at timestamptz, updated_at timestamptz)
sources(id uuid, notebook_id uuid, type text, title text, status text,
        original_url text, created_at timestamptz, indexed_at timestamptz,
        metadata jsonb)
  metadata keys: pageCount int, durationSec int, videoId text, author text,
                 charCount int, cueCount int
  type is one of PDF, TEXT, WEB, YOUTUBE, VTT
  status is one of QUEUED, UPLOADING, EXTRACTING, CHUNKING, EMBEDDING, READY, FAILED
source_chunk_stats(source_id uuid, notebook_id uuid, chunk_count int, token_count int)
`.trim();

const sqlSchema = z.object({
  statement: z
    .string()
    .describe(
      "A single read only SELECT. Must filter on notebook_id = $1. Use $1 as the only parameter. No semicolons, no comments, no CTEs that write.",
    ),
  answers: z.string().describe("The question this statement answers, in a few words."),
});

const WRITE_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|reindex|refresh|call|do|merge|lock|set|reset|listen|notify|prepare|execute)\b/i;

const ALLOWED_RELATIONS = new Set(["notebooks", "sources", "source_chunk_stats"]);

export class SqlRouteError extends Error {}

/**
 * FR-3.20c and FR-3.20d. Rejection happens before execution: a statement that
 * does not constrain itself to the active notebook is refused rather than run
 * and filtered afterwards, because filtering afterwards means the wrong rows
 * were already read.
 */
export function assertStatementSafe(statement: string): void {
  const trimmed = statement.trim().replace(/;+\s*$/, "");

  if (trimmed.includes(";")) {
    throw new SqlRouteError("Only a single statement may be executed.");
  }

  if (/--|\/\*/.test(trimmed)) {
    throw new SqlRouteError("Comments are not permitted in a generated statement.");
  }

  if (!/^\s*(select|with)\b/i.test(trimmed)) {
    throw new SqlRouteError("Only SELECT statements may be executed.");
  }

  if (WRITE_KEYWORDS.test(trimmed)) {
    throw new SqlRouteError("The statement contains a write or administrative keyword.");
  }

  if (!/notebook_id\s*=\s*\$1/i.test(trimmed)) {
    throw new SqlRouteError("The statement must constrain itself to the active notebook.");
  }

  // Any relation the generator was not shown is refused, so a hallucinated
  // table name fails here rather than as a permission error at runtime.
  const referenced = [...trimmed.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)].map(
    (match) => match[1]?.toLowerCase() ?? "",
  );

  for (const relation of referenced) {
    if (!ALLOWED_RELATIONS.has(relation)) {
      throw new SqlRouteError(`The statement references ${relation}, which is not available.`);
    }
  }
}

async function generateStatement(
  question: string,
): Promise<{ statement: string; answers: string }> {
  const model = chatModel("query", 0).withStructuredOutput(sqlSchema, { name: "notebook_sql" });

  return model.invoke([
    {
      role: "system",
      content: [
        "Write one PostgreSQL SELECT answering a question about a notebook's collection of sources.",
        "Only these relations exist:",
        SCHEMA_DESCRIPTION,
        "The active notebook id is passed as $1 and every query must filter on it.",
        "Return counts and aggregates rather than large row sets.",
      ].join("\n"),
    },
    { role: "user", content: question },
  ]);
}

/**
 * FR-3.20h. A failed, rejected or empty SQL route degrades to the other routes
 * and is recorded in the trace. It never fails the question.
 */
export async function runSqlRoute(question: string, notebookId: string): Promise<FactBlock | null> {
  if (!env.SQL_ROUTE_ENABLED || !hasLlmCredentials()) return null;

  let generated: { statement: string; answers: string };
  try {
    generated = await generateStatement(question);
  } catch (error) {
    log.warn({ err: error }, "could not generate a statement");
    return null;
  }

  const statement = generated.statement.trim().replace(/;+\s*$/, "");

  try {
    assertStatementSafe(statement);
  } catch (error) {
    log.warn({ statement, err: error }, "generated statement rejected");
    return null;
  }

  try {
    const pool = getReadOnlyPool();
    const result = await pool.query(`${statement} LIMIT ${env.SQL_MAX_ROWS}`, [notebookId]);

    if (result.rows.length === 0) return null;

    return {
      kind: "fact",
      question: generated.answers,
      // FR-3.20i: the statement travels with the answer, so a computed number is
      // checkable rather than trusted.
      statement,
      rows: result.rows as Record<string, unknown>[],
    };
  } catch (error) {
    log.warn({ statement, err: error }, "generated statement failed to execute");
    return null;
  }
}
