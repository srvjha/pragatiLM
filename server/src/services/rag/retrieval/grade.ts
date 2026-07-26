import { z } from "zod";
import { env } from "@/config/env";
import { chatModel, hasLlmCredentials } from "@/providers/llm";
import { childLogger } from "@/lib/logger";
import type { FactBlock, FusedCandidate } from "./types";

const log = childLogger("retrieval:grade");

/**
 * The right side of the pipeline. Basic RAG accepts whatever came back and
 * generates from it; this asks first whether the retrieved set can actually
 * answer the question, and what is missing if it cannot.
 *
 * The grade sits on the retrieved context rather than on the finished answer.
 * Grading an answer before showing it would put a whole generation in front of
 * the first token, and a low grade there tells you to retrieve differently
 * anyway, which is exactly what a retry can fix.
 */
export type ContextGrade = {
  score: number;
  missingAspects: string[];
  keywords: string[];
  reason: string;
};

const gradeSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "How well the passages support a complete answer. 0 means nothing relevant, 10 means everything needed is present.",
    ),
  missingAspects: z
    .array(z.string())
    .describe(
      "Parts of the question the passages do not support. Empty when the set is sufficient.",
    ),
  keywords: z
    .array(z.string())
    .describe(
      "Search terms likely to find the missing parts in the same document collection. Empty when nothing is missing.",
    ),
  reason: z.string().describe("One short sentence explaining the score."),
});

const GRADER_SYSTEM = [
  "You judge whether a set of retrieved passages can answer a question.",
  "Score only on sufficiency of evidence, never on writing quality.",
  "A passage that is merely on topic does not support an answer; it must contain the facts asked for.",
  "When something is missing, name it and suggest search terms that would find it.",
  "Do not answer the question yourself.",
].join(" ");

function contextForGrading(candidates: FusedCandidate[], facts: FactBlock[]): string {
  const passages = candidates
    .map((candidate, index) => `[${index + 1}] from "${candidate.sourceTitle}"\n${candidate.text}`)
    .join("\n\n");

  const computed = facts
    .map((fact) => `[computed] ${fact.question}: ${JSON.stringify(fact.rows)}`)
    .join("\n");

  return [passages, computed].filter(Boolean).join("\n\n");
}

/**
 * FR-3.28. One call, on the small grader model. A failure returns a passing
 * score rather than blocking: the loop exists to improve a weak set, and a
 * broken grader must not turn every question into a refusal.
 */
export async function gradeContext(
  question: string,
  candidates: FusedCandidate[],
  facts: FactBlock[] = [],
): Promise<ContextGrade> {
  if (candidates.length === 0 && facts.length === 0) {
    return {
      score: 0,
      missingAspects: ["Nothing was retrieved"],
      keywords: [],
      reason: "The search returned no passages",
    };
  }

  if (!env.CRAG_ENABLED || !hasLlmCredentials()) {
    return {
      score: 10,
      missingAspects: [],
      keywords: [],
      reason: "Grading disabled, so the retrieved set is used as is",
    };
  }

  try {
    const model = chatModel("grader", 0).withStructuredOutput(gradeSchema, {
      name: "context_grade",
    });

    const grade = await model.invoke([
      { role: "system", content: GRADER_SYSTEM },
      {
        role: "user",
        content: `Question: ${question}\n\nRetrieved:\n${contextForGrading(candidates, facts)}`,
      },
    ]);

    return {
      score: grade.score,
      missingAspects: grade.missingAspects.filter(Boolean),
      keywords: grade.keywords.filter(Boolean),
      reason: grade.reason,
    };
  } catch (error) {
    log.warn({ err: error }, "context grading failed, passing the set through");
    return {
      score: 10,
      missingAspects: [],
      keywords: [],
      reason: "The grader could not be reached, so the retrieved set is used as is",
    };
  }
}

const answerGradeSchema = z.object({
  score: z.number().min(0).max(10).describe("How well the answer is supported by the passages."),
  grounded: z
    .boolean()
    .describe("False when the answer states things the passages do not support."),
  reason: z.string(),
});

/**
 * FR-3.32. Run after the stream completes, so it costs the reader nothing. It
 * drives the ungrounded flag and the analytics; it never gates an answer that
 * has already been shown.
 */
export async function gradeAnswer(
  question: string,
  answer: string,
  candidates: FusedCandidate[],
): Promise<{ score: number; grounded: boolean; reason: string } | null> {
  if (!env.CRAG_ENABLED || !hasLlmCredentials() || answer.trim().length === 0) return null;

  try {
    const model = chatModel("grader", 0).withStructuredOutput(answerGradeSchema, {
      name: "answer_grade",
    });

    return await model.invoke([
      {
        role: "system",
        content:
          "Judge whether an answer is supported by the passages it was given. Mark it ungrounded if it asserts anything the passages do not contain.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nAnswer:\n${answer}\n\nPassages:\n${contextForGrading(candidates, [])}`,
      },
    ]);
  } catch (error) {
    log.warn({ err: error }, "answer grading failed");
    return null;
  }
}
