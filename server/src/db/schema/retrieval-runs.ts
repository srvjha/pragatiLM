import { pgTable, uuid, text, integer, real, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { notebooks } from "./notebooks";
import type { QueryVariants, RetrievalRound, RoutingDecision } from "@/types/domain";

/**
 * Diagnostic, not load bearing. Written after the answer is persisted, a failed
 * write is logged and swallowed, and deleting a run never affects a message or
 * its citations. The link runs one way, from messages.retrieval_run_id, so there
 * is no circular foreign key between the two tables.
 */
export const retrievalRuns = pgTable(
  "retrieval_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),

    originalQuery: text("original_query").notNull(),
    variants: jsonb("variants").$type<QueryVariants>().notNull().default({}),
    routing: jsonb("routing").$type<RoutingDecision | null>(),
    rounds: jsonb("rounds").$type<RetrievalRound[]>().notNull().default([]),

    finalChunkIds: uuid("final_chunk_ids").array().notNull().default([]),

    contextGrade: real("context_grade"),
    answerGrade: real("answer_grade"),
    retryCount: integer("retry_count").notNull().default(0),

    timings: jsonb("timings").$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("retrieval_runs_notebook_id_idx").on(table.notebookId),
    index("retrieval_runs_created_at_idx").on(table.createdAt),
  ],
);

export type RetrievalRun = typeof retrievalRuns.$inferSelect;
export type NewRetrievalRun = typeof retrievalRuns.$inferInsert;
