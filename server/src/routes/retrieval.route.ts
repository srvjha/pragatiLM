import { Router } from "express";
import { z } from "zod";
import { validate } from "@/middleware/validate";
import { requireNotebook } from "@/middleware/ownership";
import { retrieveOnce, retrieveWithCorrection } from "@/services/rag/retrieval";
import * as runs from "@/db/repositories/retrieval-run.repository";
import { env } from "@/config/env";
import { notFound } from "@/lib/errors";

/**
 * Development only. It runs the full retrieval path and returns the trace
 * without generating an answer, so it is always answerable why a given chunk was
 * or was not selected.
 */
export const retrievalRouter: Router = Router({ mergeParams: true });

const debugBody = z.object({
  question: z.string().trim().min(1),
  sourceIds: z.array(z.uuid()).optional(),
});

retrievalRouter.post("/debug", validate({ body: debugBody }), (req, res, next) => {
  const body = req.body as z.infer<typeof debugBody>;

  retrieveOnce({
    notebookId: requireNotebook(req).id,
    question: body.question,
    ...(body.sourceIds ? { sourceIds: body.sourceIds } : {}),
  })
    .then((result) =>
      res.json({
        data: {
          variants: result.variants,
          routing: result.routing,
          perChannel: result.lists.map((list) => ({
            variant: list.variant,
            channel: list.channel,
            chunkIds: list.candidates.map((candidate) => candidate.chunkId),
          })),
          fused: result.fused.slice(0, 15).map((candidate) => ({
            chunkId: candidate.chunkId,
            sourceTitle: candidate.sourceTitle,
            fusedScore: Number(candidate.fusedScore.toFixed(5)),
            matchedBy: candidate.matchedBy,
            preview: candidate.text.slice(0, 120),
          })),
          reranked: result.reranked.map((candidate) => ({
            chunkId: candidate.chunkId,
            sourceTitle: candidate.sourceTitle,
            locator: candidate.locator,
            score: candidate.score,
            matchedBy: candidate.matchedBy,
            preview: candidate.text.slice(0, 200),
          })),
          facts: result.facts,
          empty: result.empty,
          timingsMs: result.timingsMs,
        },
      }),
    )
    .catch(next);
});

/** The corrective path, so a round by round trace is inspectable without chat. */
retrievalRouter.post("/debug/corrective", validate({ body: debugBody }), (req, res, next) => {
  const body = req.body as z.infer<typeof debugBody>;

  retrieveWithCorrection({
    notebookId: requireNotebook(req).id,
    question: body.question,
    ...(body.sourceIds ? { sourceIds: body.sourceIds } : {}),
  })
    .then((result) =>
      res.json({
        data: {
          retryCount: result.retryCount,
          belowFloor: result.belowFloor,
          bestGrade: result.bestGrade,
          rounds: result.rounds.map((round) => ({
            round: round.round,
            queries: round.queries,
            grade: round.grade,
            missingAspects: round.missingAspects,
            keywords: round.keywords,
            rerankedCount: round.rerankedIds.length,
            timingsMs: round.timingsMs,
          })),
          final: result.best.reranked.map((candidate) => ({
            chunkId: candidate.chunkId,
            sourceTitle: candidate.sourceTitle,
            locator: candidate.locator,
            matchedBy: candidate.matchedBy,
            preview: candidate.text.slice(0, 160),
          })),
        },
      }),
    )
    .catch(next);
});

retrievalRouter.get("/runs/:runId", (req, res, next) => {
  const runId = req.params.runId;

  runs
    .findRun(requireNotebook(req).id, typeof runId === "string" ? runId : "")
    .then((row) => {
      if (!row) throw notFound("Retrieval run not found");
      res.json({ data: row });
    })
    .catch(next);
});

retrievalRouter.get("/runs", (req, res, next) => {
  runs
    .listRuns(requireNotebook(req).id)
    .then((rows) =>
      res.json({
        data: rows.map((row) => ({
          id: row.id,
          originalQuery: row.originalQuery,
          contextGrade: row.contextGrade,
          answerGrade: row.answerGrade,
          retryCount: row.retryCount,
          createdAt: row.createdAt,
        })),
      }),
    )
    .catch(next);
});

retrievalRouter.get("/analytics", (req, res, next) => {
  runs
    .analytics(requireNotebook(req).id, env.CRAG_MIN_SCORE)
    .then((data) => res.json({ data }))
    .catch(next);
});
