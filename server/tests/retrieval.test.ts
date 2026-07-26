import { describe, expect, it } from "vitest";
import {
  applyRelevanceFloor,
  assertStatementSafe,
  mmr,
  reciprocalRankFusion,
  routeQuery,
  SqlRouteError,
} from "@/services/rag/retrieval";
import type { Candidate, FusedCandidate, RankedList } from "@/services/rag/retrieval";

function candidate(id: string, score = 0.5, text = `text for ${id}`): Candidate {
  return {
    chunkId: id,
    sourceId: "source-1",
    sourceTitle: "Paper",
    sourceType: "PDF",
    chunkIndex: 0,
    text,
    locator: { kind: "pdf", page: 1 },
    score,
  };
}

function list(variant: string, channel: "VECTOR" | "FTS", ids: string[]): RankedList {
  return { variant, channel, candidates: ids.map((id) => candidate(id)) };
}

describe("reciprocal rank fusion", () => {
  it("ranks by summed reciprocal rank across lists", () => {
    const fused = reciprocalRankFusion([list("original", "VECTOR", ["a", "b", "c"])], 60);

    expect(fused.map((row) => row.chunkId)).toEqual(["a", "b", "c"]);
    expect(fused[0]?.fusedScore).toBeCloseTo(1 / 61, 6);
    expect(fused[1]?.fusedScore).toBeCloseTo(1 / 62, 6);
  });

  it("collapses duplicates and records every variant that found them", () => {
    const fused = reciprocalRankFusion(
      [list("original", "VECTOR", ["a", "b"]), list("rewrite", "FTS", ["a", "c"])],
      60,
    );

    const a = fused.find((row) => row.chunkId === "a");
    expect(a?.matchedBy).toEqual(["original:VECTOR", "rewrite:FTS"]);
    expect(a?.fusedScore).toBeCloseTo(1 / 61 + 1 / 61, 6);
    expect(fused.filter((row) => row.chunkId === "a")).toHaveLength(1);
  });

  it("puts a chunk found by three variants above one that led a single list", () => {
    // This is the whole reason for generating variants: agreement across
    // rephrasings beats a single first place.
    const fused = reciprocalRankFusion(
      [
        list("original", "VECTOR", ["loner", "agreed"]),
        list("rewrite", "VECTOR", ["x", "agreed"]),
        list("stepBack", "VECTOR", ["y", "agreed"]),
      ],
      60,
    );

    expect(fused[0]?.chunkId).toBe("agreed");
    expect(fused[0]?.matchedBy).toHaveLength(3);
  });

  it("is stable when a list comes back empty", () => {
    const fused = reciprocalRankFusion(
      [list("original", "VECTOR", ["a", "b"]), { variant: "hyde", channel: "FTS", candidates: [] }],
      60,
    );

    expect(fused.map((row) => row.chunkId)).toEqual(["a", "b"]);
  });
});

describe("relevance floor", () => {
  const fused = (scores: number[]): FusedCandidate[] =>
    scores.map((score, index) => ({
      ...candidate(`c${index}`),
      fusedScore: score,
      matchedBy: ["original:VECTOR"],
    }));

  it("drops candidates far below the best result", () => {
    expect(applyRelevanceFloor(fused([1, 0.5, 0.2, 0.05]), 0.25).map((r) => r.chunkId)).toEqual([
      "c0",
      "c1",
    ]);
  });

  it("keeps a single candidate, since there is nothing to compare it against", () => {
    expect(applyRelevanceFloor(fused([0.001]), 0.25)).toHaveLength(1);
  });
});

describe("MMR fallback", () => {
  it("prefers a diverse second result over a near duplicate of the first", () => {
    const candidates: FusedCandidate[] = [
      {
        ...candidate(
          "best",
          1,
          "Raft elects a leader per term using randomised election timeouts.",
        ),
        fusedScore: 1,
        matchedBy: [],
      },
      {
        ...candidate(
          "duplicate",
          0.9,
          "Raft elects a leader per term using randomised election timeouts.",
        ),
        fusedScore: 0.9,
        matchedBy: [],
      },
      {
        ...candidate("diverse", 0.8, "Sharding partitions rows across nodes by a partition key."),
        fusedScore: 0.8,
        matchedBy: [],
      },
    ];

    const picked = mmr(candidates, 2);
    expect(picked[0]?.chunkId).toBe("best");
    expect(picked[1]?.chunkId).toBe("diverse");
  });
});

describe("query routing heuristics", () => {
  it("forces keyword search for a quoted phrase", async () => {
    const decision = await routeQuery('where does it say "write ahead log"', []);
    expect(decision.channels).toContain("FTS");
    expect(decision.decidedBy).toBe("heuristic");
  });

  it("forces keyword search for an error code", async () => {
    expect((await routeQuery("what causes error 403 on that page", [])).channels).toContain("FTS");
  });

  it("routes a counting question about the notebook to SQL", async () => {
    const decision = await routeQuery("how many videos do I have in here", []);
    expect(decision.channels).toContain("SQL");
    expect(decision.channels).toContain("VECTOR");
  });

  it("does not route a content question to SQL", async () => {
    expect((await routeQuery("what does the video say about sharding", [])).channels).not.toContain(
      "SQL",
    );
  });

  it("falls back to both content channels when nothing is conclusive", async () => {
    const decision = await routeQuery("explain consensus", []);
    expect(decision.channels).toEqual(["VECTOR", "FTS"]);
    expect(decision.decidedBy).toBe("fallback");
  });

  it("carries the selected sources through, and never widens them", async () => {
    const selected = ["11111111-1111-1111-1111-111111111111"];
    expect((await routeQuery("how many sources are there", selected)).sourceIds).toEqual(selected);
  });
});

describe("SQL statement guard rails", () => {
  const valid = "SELECT count(*) FROM sources WHERE notebook_id = $1";

  it("accepts a scoped read only select", () => {
    expect(() => assertStatementSafe(valid)).not.toThrow();
  });

  it("rejects a statement with no notebook constraint, before it can run", () => {
    expect(() => assertStatementSafe("SELECT count(*) FROM sources")).toThrow(SqlRouteError);
  });

  it("rejects every write and administrative verb", () => {
    for (const statement of [
      "INSERT INTO sources (title) VALUES ('x')",
      "UPDATE sources SET title = 'x' WHERE notebook_id = $1",
      "DELETE FROM sources WHERE notebook_id = $1",
      "DROP TABLE sources",
      "GRANT SELECT ON sources TO notebook_ro",
    ]) {
      expect(() => assertStatementSafe(statement), statement).toThrow(SqlRouteError);
    }
  });

  it("rejects stacked statements", () => {
    expect(() => assertStatementSafe(`${valid}; DROP TABLE sources`)).toThrow(/single statement/);
  });

  it("rejects comment terminated statements", () => {
    expect(() =>
      assertStatementSafe(`SELECT * FROM sources WHERE notebook_id = $1 -- AND false`),
    ).toThrow(/Comments/);
  });

  it("rejects a relation outside the allowlist", () => {
    expect(() => assertStatementSafe("SELECT text FROM chunks WHERE notebook_id = $1")).toThrow(
      /chunks/,
    );
    expect(() =>
      assertStatementSafe("SELECT content FROM messages WHERE notebook_id = $1"),
    ).toThrow(/messages/);
  });

  it("rejects a join onto a table it was never shown", () => {
    expect(() =>
      assertStatementSafe(
        "SELECT s.title FROM sources s JOIN source_files f ON f.source_id = s.id WHERE s.notebook_id = $1",
      ),
    ).toThrow(/source_files/);
  });

  it("allows the aggregate view, which is how size questions are answered", () => {
    expect(() =>
      assertStatementSafe(
        "SELECT source_id, chunk_count FROM source_chunk_stats WHERE notebook_id = $1 ORDER BY chunk_count DESC",
      ),
    ).not.toThrow();
  });
});
