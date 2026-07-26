import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { retrievalRuns } from "@/db/schema";
import type { RetrievalRun } from "@/db/schema";
import type { QueryVariants, RetrievalRound, RoutingDecision } from "@/types/domain";

/**
 * Diagnostic, never load bearing. Written after the answer is persisted, and a
 * failed write is logged and swallowed by the caller.
 */
export async function insertRun(values: {
  notebookId: string;
  originalQuery: string;
  variants: QueryVariants;
  routing: RoutingDecision;
  rounds: RetrievalRound[];
  finalChunkIds: string[];
  contextGrade: number;
  retryCount: number;
  timings: Record<string, number>;
}): Promise<RetrievalRun | undefined> {
  const [row] = await db.insert(retrievalRuns).values(values).returning();
  return row;
}

export async function setAnswerGrade(runId: string, answerGrade: number): Promise<void> {
  await db.update(retrievalRuns).set({ answerGrade }).where(eq(retrievalRuns.id, runId));
}

export async function findRun(
  notebookId: string,
  runId: string,
): Promise<RetrievalRun | undefined> {
  const [row] = await db
    .select()
    .from(retrievalRuns)
    .where(and(eq(retrievalRuns.notebookId, notebookId), eq(retrievalRuns.id, runId)))
    .limit(1);
  return row;
}

export async function listRuns(notebookId: string, limit = 20): Promise<RetrievalRun[]> {
  return db
    .select()
    .from(retrievalRuns)
    .where(eq(retrievalRuns.notebookId, notebookId))
    .orderBy(desc(retrievalRuns.createdAt))
    .limit(limit);
}

export type RetrievalAnalytics = {
  runs: number;
  gradeDistribution: { bucket: string; count: number }[];
  medianRounds: number;
  floorHitRate: number;
  translationFailureRate: number;
  winningVariantTypes: { variant: string; count: number }[];
};

/**
 * FR-3.36. The "what is working and what is not" view: a high median round count
 * means the retriever or the chunking is wrong, not that the loop is doing well.
 */
export async function analytics(notebookId: string, minScore: number): Promise<RetrievalAnalytics> {
  const rows = await db
    .select()
    .from(retrievalRuns)
    .where(eq(retrievalRuns.notebookId, notebookId))
    .orderBy(desc(retrievalRuns.createdAt))
    .limit(500);

  if (rows.length === 0) {
    return {
      runs: 0,
      gradeDistribution: [],
      medianRounds: 0,
      floorHitRate: 0,
      translationFailureRate: 0,
      winningVariantTypes: [],
    };
  }

  const buckets = new Map<string, number>();
  for (const row of rows) {
    const score = row.contextGrade ?? 0;
    const bucket = score >= 8 ? "8-10" : score >= 6 ? "6-8" : score >= 3 ? "3-6" : "0-3";
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  const retries = rows.map((row) => row.retryCount).sort((a, b) => a - b);
  const medianRounds = retries[Math.floor(retries.length / 2)] ?? 0;
  const belowFloor = rows.filter((row) => (row.contextGrade ?? 0) < minScore).length;

  // A run whose only variant was the original means translation was off, absent
  // or degraded, which is worth watching rather than guessing at.
  const untranslated = rows.filter((row) => {
    const variants = row.variants;
    return !variants.rewrite && !variants.stepBack && !variants.hyde;
  }).length;

  const variantWins = new Map<string, number>();
  for (const row of rows) {
    const finalRound = row.rounds[row.rounds.length - 1];
    if (!finalRound) continue;

    for (const chunkId of row.finalChunkIds) {
      for (const [key, ids] of Object.entries(finalRound.perChannelIds)) {
        if (!ids.includes(chunkId)) continue;
        const variant = key.split(":")[0] ?? "unknown";
        variantWins.set(variant, (variantWins.get(variant) ?? 0) + 1);
      }
    }
  }

  return {
    runs: rows.length,
    gradeDistribution: [...buckets.entries()].map(([bucket, count]) => ({ bucket, count })),
    medianRounds,
    floorHitRate: Number((belowFloor / rows.length).toFixed(3)),
    translationFailureRate: Number((untranslated / rows.length).toFixed(3)),
    winningVariantTypes: [...variantWins.entries()]
      .map(([variant, count]) => ({ variant, count }))
      .sort((a, b) => b.count - a.count),
  };
}
