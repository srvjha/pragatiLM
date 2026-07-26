import { describe, expect, it } from "vitest";
import { looksUngrounded, resolveMarkers } from "@/services/rag/citations";
import { buildContextBlocks } from "@/services/rag/prompts/answer";
import type { FactBlock, FusedCandidate } from "@/services/rag/retrieval";

function candidate(id: string, text: string, page = 1): FusedCandidate {
  return {
    chunkId: id,
    sourceId: `source-${id}`,
    sourceTitle: `Paper ${id}`,
    sourceType: "PDF",
    chunkIndex: 0,
    text,
    locator: { kind: "pdf", page },
    score: 0.9,
    fusedScore: 0.5,
    matchedBy: ["original:VECTOR"],
  };
}

const blocks = [
  candidate("a", "Raft elects one leader per term."),
  candidate("b", "Sharding partitions data.", 7),
];

describe("marker resolution", () => {
  it("keeps a marker that points at a supplied block and attaches its citation", () => {
    const result = resolveMarkers("Raft elects one leader per term [1].", blocks);

    expect(result.content).toBe("Raft elects one leader per term [1].");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.chunkId).toBe("a");
    expect(result.citations[0]?.locator).toEqual({ kind: "pdf", page: 1 });
    expect(result.strippedCount).toBe(0);
  });

  it("strips a marker pointing at a block that was never supplied, per FR-4.4", () => {
    // A citation that resolves to nothing is worse than no citation, because it
    // looks like evidence.
    const result = resolveMarkers("This is true [7] and so is this [1].", blocks);

    expect(result.content).not.toContain("[7]");
    expect(result.content).toContain("[1]");
    expect(result.strippedCount).toBe(1);
    expect(result.citations).toHaveLength(1);
  });

  it("strips a zero marker", () => {
    expect(resolveMarkers("Nonsense [0] and more [1].", blocks).strippedCount).toBe(1);
  });

  it("renumbers markers to the order they appear in the answer", () => {
    // The reader sees 1, 2 in reading order rather than the retrieval order.
    const result = resolveMarkers("Second block first [2], then the first [1].", blocks);

    expect(result.content).toBe("Second block first [1], then the first [2].");
    expect(result.citations[0]?.chunkId).toBe("b");
    expect(result.citations[1]?.chunkId).toBe("a");
  });

  it("gives a block cited twice one number and one citation", () => {
    const result = resolveMarkers("Once [1], and again [1].", blocks);
    expect(result.citations).toHaveLength(1);
    expect(result.content).toBe("Once [1], and again [1].");
  });

  it("tidies the spacing a stripped marker leaves behind", () => {
    expect(resolveMarkers("A claim [9] with nothing behind it.", blocks).content).toBe(
      "A claim with nothing behind it.",
    );
  });

  it("copies the snippet and locator, so a re-index cannot break an old answer", () => {
    const result = resolveMarkers("From page seven [2].", blocks);
    expect(result.citations[0]?.snippet).toBe("Sharding partitions data.");
    expect(result.citations[0]?.locator).toEqual({ kind: "pdf", page: 7 });
  });

  it("produces no citation for a computed fact block", () => {
    const fact: FactBlock = {
      kind: "fact",
      question: "how many sources",
      statement: "SELECT count(*)...",
      rows: [{ count: 3 }],
    };

    // A number computed from the notebook is not a quotation and opens no
    // viewer, so it earns no chip.
    const result = resolveMarkers("You have three sources [3].", blocks, [fact]);

    expect(result.citations).toHaveLength(0);
    expect(result.content).not.toContain("[3]");
  });

  it("handles an answer with no markers at all", () => {
    const result = resolveMarkers("I could not find this in your sources.", blocks);
    expect(result.citations).toHaveLength(0);
    expect(result.strippedCount).toBe(0);
  });
});

describe("ungrounded detection", () => {
  it("flags an answer with no citations drawn from a non empty retrieval set", () => {
    expect(looksUngrounded([], 8)).toBe(true);
  });

  it("does not flag a refusal, where nothing was retrieved", () => {
    expect(looksUngrounded([], 0)).toBe(false);
  });
});

describe("context blocks", () => {
  it("numbers blocks from one and names the source and position", () => {
    const { text, blockCount } = buildContextBlocks(blocks, []);
    expect(blockCount).toBe(2);
    expect(text).toContain("[1] Paper a, page 1");
    expect(text).toContain("[2] Paper b, page 7");
  });

  it("formats a timestamp range readably", () => {
    const timed: FusedCandidate = {
      ...candidate("t", "Spoken content."),
      locator: { kind: "timed", startSec: 65, endSec: 130 },
    };
    expect(buildContextBlocks([timed], []).text).toContain("1:05 to 2:10");
  });

  it("marks a computed block so the model cannot present it as a quotation", () => {
    const fact: FactBlock = {
      kind: "fact",
      question: "how many videos",
      statement: "SELECT count(*) FROM sources WHERE notebook_id = $1",
      rows: [{ count: 4 }],
    };

    const { text, blockCount } = buildContextBlocks(blocks, [fact]);
    expect(blockCount).toBe(3);
    expect(text).toContain("[3] (computed) how many videos");
  });
});
