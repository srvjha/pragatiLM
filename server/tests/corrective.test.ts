import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The loop is tested against a stubbed retriever and grader, because what is
 * being asserted is the retry policy: when it stops, which round it keeps, and
 * what it does when nothing is ever good enough. Real retrieval quality is a
 * different question, tested elsewhere.
 */
const retrieveOnce = vi.hoisted(() => vi.fn());
const gradeContext = vi.hoisted(() => vi.fn());

vi.mock("@/services/rag/retrieval/pipeline", () => ({ retrieveOnce }));
vi.mock("@/services/rag/retrieval/grade", () => ({ gradeContext, gradeAnswer: vi.fn() }));

const { retrieveWithCorrection } = await import("@/services/rag/retrieval/corrective");

function resultWith(chunkIds: string[]) {
  return {
    variants: [{ label: "original", text: "q" }],
    routing: {
      channels: ["VECTOR"],
      sourceTypes: [],
      sourceIds: [],
      decidedBy: "fallback",
      reason: "",
    },
    lists: [
      {
        channel: "VECTOR" as const,
        variant: "original",
        candidates: chunkIds.map((id) => ({ chunkId: id }) as never),
      },
    ],
    fused: chunkIds.map((id) => ({ chunkId: id }) as never),
    reranked: chunkIds.map((id) => ({ chunkId: id, text: id, sourceTitle: "s" }) as never),
    facts: [],
    empty: false,
    timingsMs: {},
  };
}

function grade(score: number, keywords: string[] = ["more", "terms"]) {
  return { score, missingAspects: ["something"], keywords, reason: "because" };
}

beforeEach(() => {
  retrieveOnce.mockReset();
  gradeContext.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("corrective loop", () => {
  it("stops after one round when the first grade clears the floor", async () => {
    retrieveOnce.mockResolvedValue(resultWith(["a"]));
    gradeContext.mockResolvedValue(grade(9));

    const result = await retrieveWithCorrection({ notebookId: "n", question: "q" });

    expect(retrieveOnce).toHaveBeenCalledTimes(1);
    expect(result.retryCount).toBe(0);
    expect(result.belowFloor).toBe(false);
  });

  it("retries with the grader's keywords when the first round is insufficient", async () => {
    retrieveOnce
      .mockResolvedValueOnce(resultWith(["weak"]))
      .mockResolvedValueOnce(resultWith(["strong"]));
    gradeContext
      .mockResolvedValueOnce(grade(3, ["election", "timeout"]))
      .mockResolvedValueOnce(grade(9));

    const result = await retrieveWithCorrection({ notebookId: "n", question: "q" });

    expect(retrieveOnce).toHaveBeenCalledTimes(2);
    expect(result.retryCount).toBe(1);

    // The second call carries the grader's terms as extra query variants, which
    // is the whole mechanism of the correction.
    const secondCallVariants = retrieveOnce.mock.calls[1]?.[1] as { label: string; text: string }[];
    expect(secondCallVariants.some((variant) => variant.text.includes("election"))).toBe(true);
  });

  it("terminates at the retry cap when nothing ever clears the floor", async () => {
    retrieveOnce.mockResolvedValue(resultWith(["a"]));
    gradeContext.mockResolvedValue(grade(5));

    const result = await retrieveWithCorrection({ notebookId: "n", question: "q" });

    // CRAG_MAX_RETRIES is 3, so four rounds in total.
    expect(retrieveOnce).toHaveBeenCalledTimes(4);
    expect(result.retryCount).toBe(3);
  });

  it("keeps the best scoring round, not the last one", async () => {
    retrieveOnce
      .mockResolvedValueOnce(resultWith(["round0"]))
      .mockResolvedValueOnce(resultWith(["round1-best"]))
      .mockResolvedValueOnce(resultWith(["round2"]))
      .mockResolvedValueOnce(resultWith(["round3-worst"]));

    // A correction can make things worse; keeping the worse set purely because
    // it came later would be absurd.
    gradeContext
      .mockResolvedValueOnce(grade(2))
      .mockResolvedValueOnce(grade(5))
      .mockResolvedValueOnce(grade(3))
      .mockResolvedValueOnce(grade(1));

    const result = await retrieveWithCorrection({ notebookId: "n", question: "q" });

    expect(result.bestGrade.score).toBe(5);
    expect(result.best.reranked[0]?.chunkId).toBe("round1-best");
    // 5 is short of the retry bar but well above the refusal bar: the answer is
    // written from what was found, rather than withheld because it could have
    // been better.
    expect(result.belowFloor).toBe(false);
  });

  it("stops early when the grader offers nothing to search for", async () => {
    retrieveOnce.mockResolvedValue(resultWith(["a"]));
    gradeContext.mockResolvedValue({
      score: 4,
      missingAspects: [],
      keywords: [],
      reason: "not enough",
    });

    // Another identical round would only cost time. The set is still answered
    // from: 4 is below the retry bar, not below the refusal bar.
    expect((await retrieveWithCorrection({ notebookId: "n", question: "q" })).belowFloor).toBe(
      false,
    );
    expect(retrieveOnce).toHaveBeenCalledTimes(1);
  });

  it("refuses only when the grade is very low, not merely imperfect", async () => {
    retrieveOnce.mockResolvedValue(resultWith(["a"]));
    gradeContext.mockResolvedValue(grade(1));

    const result = await retrieveWithCorrection({ notebookId: "n", question: "q" });

    // 1 out of 10 means the passages are about something else entirely, which
    // is the case refusing exists for.
    expect(result.belowFloor).toBe(true);
  });

  it("refuses when nothing was retrieved at all", async () => {
    retrieveOnce.mockResolvedValue(resultWith([]));
    gradeContext.mockResolvedValue(grade(8));

    const result = await retrieveWithCorrection({ notebookId: "n", question: "q" });

    // An empty set cannot support an answer whatever a grader claims about it.
    expect(result.belowFloor).toBe(true);
  });

  it("reports each round as it is graded, and announces a correction", async () => {
    retrieveOnce.mockResolvedValueOnce(resultWith(["a"])).mockResolvedValueOnce(resultWith(["b"]));
    gradeContext.mockResolvedValueOnce(grade(3)).mockResolvedValueOnce(grade(8));

    const graded: number[] = [];
    const corrected: number[] = [];

    await retrieveWithCorrection(
      { notebookId: "n", question: "q" },
      {
        onGraded: (round) => void graded.push(round),
        onCorrecting: (round) => void corrected.push(round),
      },
    );

    // FR-3.33: a correction round is visible to the user, not hidden behind a
    // longer spinner.
    expect(graded).toEqual([0, 1]);
    expect(corrected).toEqual([0]);
  });

  it("records every round in the trace, including the ones that were discarded", async () => {
    retrieveOnce.mockResolvedValue(resultWith(["a"]));
    gradeContext.mockResolvedValueOnce(grade(2)).mockResolvedValue(grade(9));

    const result = await retrieveWithCorrection({ notebookId: "n", question: "q" });

    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0]?.grade).toBe(2);
    expect(result.rounds[1]?.grade).toBe(9);
  });
});
