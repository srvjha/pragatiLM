/**
 * The labelled question set.
 *
 * A question is labelled by a phrase that has to appear in a retrieved passage
 * for that passage to count as relevant, rather than by chunk id. Chunk ids
 * change on every re-index and with every chunking change, which is exactly
 * when this set is most needed; a phrase survives both.
 *
 * The questions are chosen to exercise particular stages, so a result table can
 * say which stage earned its latency rather than only that the total moved.
 * `probes` names the stage each question is meant to stress.
 */
export type EvalQuestion = {
  question: string;
  /** Case insensitive, whitespace normalised. Any one match makes it relevant. */
  expect: string[];
  probes: "baseline" | "rewrite" | "stepback" | "subquestions" | "hyde" | "keyword" | "refusal";
  note: string;
};

export const QUESTIONS: EvalQuestion[] = [
  {
    question: "What does the FLP result say?",
    expect: ["no deterministic protocol can guarantee consensus"],
    probes: "baseline",
    note: "Names the term in the source. Plain lookup, and the control for everything else.",
  },
  {
    question: "How does Raft break the problem down?",
    expect: ["leader election, log replication and safety"],
    probes: "baseline",
    note: "Direct, but phrased differently from the source sentence.",
  },
  {
    question:
      "Why can a system never be sure everyone has agreed when one machine might die and the network is slow?",
    expect: ["no deterministic protocol can guarantee consensus", "asynchronous system"],
    probes: "hyde",
    note: "Describes the idea without any of its vocabulary. A hypothetical answer should match the prose where the question does not.",
  },
  {
    question: "What stops two leaders existing at the same time?",
    expect: ["at most one leader is elected per term", "logical clock"],
    probes: "stepback",
    note: "The answer is a principle stated more abstractly than the question.",
  },
  {
    question: "How is data spread over machines, and what makes rebalancing it expensive?",
    expect: [
      "partitions data across nodes",
      "moves data while the system continues to serve traffic",
    ],
    probes: "subquestions",
    note: "Two questions in one. A single embedding tends to favour whichever half is more distinctive.",
  },
  {
    question: 'What is a "term" in this protocol?',
    expect: ["logical clock"],
    probes: "keyword",
    note: "A quoted short word. Embeddings blur it; the keyword channel should not.",
  },
  {
    question: "Which direction do log entries travel?",
    expect: ["from the leader to followers"],
    probes: "baseline",
    note: "Short factual lookup.",
  },
  {
    question: "What does consensus underpin?",
    expect: ["leader election, atomic commit and replicated state machines"],
    probes: "baseline",
    note: "The answer is a list, which reranking should keep whole.",
  },
  {
    question: "What were the quarterly revenue figures for the Asia Pacific region?",
    expect: [],
    probes: "refusal",
    note: "Nothing in the corpus supports this. An empty expectation means the correct outcome is retrieving nothing above the floor.",
  },
];
