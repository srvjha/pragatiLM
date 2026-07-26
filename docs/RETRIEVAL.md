# One question, traced end to end

This is a real trace from a running instance, captured with
`POST /notebooks/:id/retrieval/debug`. The notebook holds three seeded sources:
a three page PDF on distributed systems, a recorded lecture transcript, and a short
markdown note.

The question:

> what does it say about consensus and quorums

## 1. Query translation

```
original: what does it say about consensus and quorums
```

Only the original survives here because this instance runs without `OPENAI_API_KEY`.
With a key configured this stage adds a standalone rewrite, a step back question, any
sub questions, and a HyDE passage, all from one structured call plus one concurrent
call for the passage. The original is always kept, so a bad translation can never
remove the user's own wording from the candidate set.

## 2. Routing

```
channels:   VECTOR + FTS
decided by: fallback
reason:     Routing disabled or inconclusive, so both content channels run
```

Nothing in this question forces a specific channel: no quoted phrase, no error code, no
counting word. Heuristics are inconclusive, so both content channels run. Routing can
only narrow, never widen past the notebook filter or the user's source selection.

## 3. Search, per variant and channel

```
original on VECTOR: 0 candidates
original on FTS: 13 candidates
```

Dense search returns nothing here because the placeholder embedding provider carries no
semantics. The keyword channel does the work, which is exactly the case hybrid retrieval
exists for: when one channel is blind, the other still answers.

## 4. Fusion

```
0.01639  original:FTS  Consensus in distributed systems
         Consensus in distributed systems
Consensus is the problem of getting a s...
0.01613  original:FTS  Consensus in distributed systems
         Consensus in distributed systems
Consensus is the problem of getting a s...
0.01587  original:FTS  Recorded lecture
         All right. And then let use the schedule notification utility. So, I can...
0.01563  original:FTS  Recorded lecture
         So this is your header. Simple. They are basically showing you the token...
0.01538  original:FTS  Recorded lecture
         Don't doom scroll. Insta focus on study. Okay and then you can even set ...
```

Each candidate scores `1 / (60 + rank)` per list it appears in, summed. With several query
variants the same chunk appears in several lists and its score compounds, which is the
whole reason for generating variants: agreement across rephrasings beats a single first
place. `matchedBy` records which variant and channel found it, so any result is explicable.

## 5. Rerank and floor

```
13 fused -> 8 kept

1. Consensus in distributed systems  {"kind":"pdf","page":2}
   Consensus in distributed systems
Consensus is the problem of getting a s...
2. Recorded lecture  {"kind":"timed","endSec":309.5,"startSec":240.4}
   All right. And then let use the schedule notification utility. So, I can...
3. Recorded lecture  {"kind":"timed","endSec":666.78,"startSec":606.34}
   Don't doom scroll. Insta focus on study. Okay and then you can even set ...
```

The floor is applied to the fused score normalised against the best result in this run,
because an absolute RRF score means nothing on its own: its scale depends on how many
lists were fused. Reranking runs against the user's original question, never a translated
variant, since the variants exist to widen recall and judging relevance against a
machine's rephrasing would compound whatever it got wrong.

The top result carries `{"kind":"pdf","page":2}`. That locator is what a citation
resolves to, and it is why the chunker stops at a page boundary even when the token
target would allow more: a chunk spanning pages would cite the wrong one.

## 6. Timings

```
translate  0ms
route      1ms
search     14ms
fuse       0ms
rerank     6ms
```

Translation and grading are zero here because both need a model. With credentials they
add roughly two round trips on a small model, not one per technique, which is what keeps
time to first token inside the three second budget on the path with no correction round.

## What is not shown

This trace is the single pass path. `POST /retrieval/debug/corrective` runs the same
pipeline inside the correction loop and returns a round by round trace: the grade, what
the grader judged missing, the keywords it suggested, and which round was kept. The best
scoring round wins, never simply the last, because a correction can make things worse.
