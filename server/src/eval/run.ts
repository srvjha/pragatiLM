import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { notebooks, sources, users } from "@/db/schema";
import { putFile } from "@/db/repositories/source-file.repository";
import { runIngestion } from "@/ingestion/pipeline";
import { ensureCollection } from "@/vector/qdrant.repository";
import { retrieveOnce } from "@/services/rag/retrieval";
import { env } from "@/config/env";
import { closeQueues } from "@/queues";
import { QUESTIONS, type EvalQuestion } from "./questions";

/**
 * FR-3.36 and the PRD's retrieval acceptance criterion: the claim that query
 * translation improves results has to be a number, not an assertion.
 *
 * The harness ingests a fixed corpus, runs the labelled question set through
 * retrieval once per configuration, and prints what each stage is worth. A
 * stage that does not move the numbers is not defended, it is turned off.
 *
 *   npm run eval
 *
 * This costs real model calls, which is why it is a script rather than part of
 * the test suite: the suite has to run on a machine with no key.
 */

const FIXTURES = join(import.meta.dirname, "..", "..", "tests", "fixtures");

const CORPUS: { type: "PDF" | "TEXT"; file: string; title: string }[] = [
  { type: "PDF", file: "distributed-systems.pdf", title: "Consensus in distributed systems" },
  { type: "TEXT", file: "notes.md", title: "Research notes" },
];

/** The configurations compared. Each names the flags it changes from the full pipeline. */
const CONFIGS: { name: string; flags: Partial<typeof env> }[] = [
  {
    name: "plain hybrid",
    flags: {
      QUERY_TRANSLATION_ENABLED: false,
      REWRITE_ENABLED: false,
      STEPBACK_ENABLED: false,
      SUBQUESTIONS_ENABLED: false,
      HYDE_ENABLED: false,
      RERANK_ENABLED: false,
    },
  },
  {
    name: "+ translation",
    flags: {
      QUERY_TRANSLATION_ENABLED: true,
      REWRITE_ENABLED: true,
      STEPBACK_ENABLED: true,
      SUBQUESTIONS_ENABLED: true,
      HYDE_ENABLED: true,
      RERANK_ENABLED: false,
    },
  },
  {
    name: "+ rerank",
    flags: {
      QUERY_TRANSLATION_ENABLED: true,
      REWRITE_ENABLED: true,
      STEPBACK_ENABLED: true,
      SUBQUESTIONS_ENABLED: true,
      HYDE_ENABLED: true,
      RERANK_ENABLED: true,
    },
  },
  {
    name: "translation off, rerank on",
    flags: {
      QUERY_TRANSLATION_ENABLED: false,
      REWRITE_ENABLED: false,
      STEPBACK_ENABLED: false,
      SUBQUESTIONS_ENABLED: false,
      HYDE_ENABLED: false,
      RERANK_ENABLED: true,
    },
  },
];

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** A passage is relevant when it contains any of the question's labelled phrases. */
function isRelevant(text: string, expect: string[]): boolean {
  const haystack = normalise(text);
  return expect.some((phrase) => haystack.includes(normalise(phrase)));
}

type Scored = { hit: boolean; reciprocalRank: number; returned: number };

function score(question: EvalQuestion, passages: { text: string }[]): Scored {
  // An out of scope question is scored inverted: the right behaviour is to
  // return nothing, so retrieving nothing is the hit.
  if (question.expect.length === 0) {
    return {
      hit: passages.length === 0,
      reciprocalRank: passages.length === 0 ? 1 : 0,
      returned: passages.length,
    };
  }

  const rank = passages.findIndex((passage) => isRelevant(passage.text, question.expect));

  return {
    hit: rank !== -1,
    reciprocalRank: rank === -1 ? 0 : 1 / (rank + 1),
    returned: passages.length,
  };
}

async function seed(): Promise<string> {
  await ensureCollection();

  const email = "eval@localhost.invalid";
  await db.delete(users).where(eq(users.email, email));

  const [user] = await db
    .insert(users)
    .values({ name: "Eval", email, emailVerified: true })
    .returning();
  if (!user) throw new Error("Could not create the eval user");

  const [notebook] = await db
    .insert(notebooks)
    .values({ userId: user.id, name: "Eval corpus" })
    .returning();
  if (!notebook) throw new Error("Could not create the eval notebook");

  for (const item of CORPUS) {
    const path = join(FIXTURES, item.file);
    if (!existsSync(path)) throw new Error(`Missing fixture: ${item.file}`);

    const [source] = await db
      .insert(sources)
      .values({
        notebookId: notebook.id,
        type: item.type,
        title: item.title,
        contentHash: `eval-${item.file}`,
        status: "QUEUED",
      })
      .returning();
    if (!source) throw new Error("Could not create the eval source");

    await putFile({
      sourceId: source.id,
      kind: "original",
      filename: item.file,
      mimeType: item.type === "PDF" ? "application/pdf" : "text/plain",
      bytes: readFileSync(path),
    });

    // Inline rather than queued: the harness needs the corpus indexed before it
    // can measure anything, and waiting on a worker adds nothing.
    const outcome = await runIngestion(source.id);
    if (outcome.chunkCount === 0) {
      throw new Error(`Ingestion produced no chunks for ${item.file}`);
    }
  }

  return notebook.id;
}

function applyFlags(flags: Partial<typeof env>): void {
  // The only place that writes to env. Every stage reads its flag at call time
  // rather than at import, so overriding here changes the next run and nothing
  // else. Threading a config object through six modules would be the tidier
  // shape if anything other than this harness ever needed it.
  Object.assign(env, flags);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

async function main(): Promise<void> {
  if (env.EMBEDDING_PROVIDER === "fake") {
    process.stderr.write(
      '\nEMBEDDING_PROVIDER is "fake", so the vectors carry no meaning and every number\n' +
        "here would be noise. Set EMBEDDING_PROVIDER=openai and OPENAI_API_KEY, then rerun.\n\n",
    );
    process.exit(1);
  }

  if (!env.OPENAI_API_KEY) {
    process.stderr.write("\nOPENAI_API_KEY is not set, so retrieval cannot run.\n\n");
    process.exit(1);
  }

  const original = { ...env };
  process.stdout.write("Indexing the eval corpus...\n");
  const notebookId = await seed();

  const results: { config: string; hitRate: number; mrr: number; byProbe: Map<string, number> }[] =
    [];

  for (const config of CONFIGS) {
    applyFlags({ ...original, ...config.flags });
    process.stdout.write(`\nRunning "${config.name}"...\n`);

    const scores: Scored[] = [];
    const byProbe = new Map<string, { hits: number; total: number }>();

    for (const question of QUESTIONS) {
      const result = await retrieveOnce({ notebookId, question: question.question });
      const scored = score(question, result.reranked);
      scores.push(scored);

      const bucket = byProbe.get(question.probes) ?? { hits: 0, total: 0 };
      bucket.total += 1;
      if (scored.hit) bucket.hits += 1;
      byProbe.set(question.probes, bucket);

      process.stdout.write(
        `  ${scored.hit ? "hit " : "MISS"}  rr=${scored.reciprocalRank.toFixed(2)}  ${question.question.slice(0, 62)}\n`,
      );
    }

    results.push({
      config: config.name,
      hitRate: scores.filter((s) => s.hit).length / scores.length,
      mrr: scores.reduce((total, s) => total + s.reciprocalRank, 0) / scores.length,
      byProbe: new Map([...byProbe].map(([probe, b]) => [probe, b.hits / b.total])),
    });
  }

  const probes = [...new Set(QUESTIONS.map((q) => q.probes))];

  process.stdout.write(`\n\n${pad("configuration", 28)}${pad("hit rate", 11)}${pad("MRR", 8)}`);
  for (const probe of probes) process.stdout.write(pad(probe, 14));
  process.stdout.write("\n" + "-".repeat(28 + 11 + 8 + probes.length * 14) + "\n");

  for (const row of results) {
    process.stdout.write(
      pad(row.config, 28) + pad(row.hitRate.toFixed(2), 11) + pad(row.mrr.toFixed(3), 8),
    );
    for (const probe of probes) {
      process.stdout.write(pad((row.byProbe.get(probe) ?? 0).toFixed(2), 14));
    }
    process.stdout.write("\n");
  }

  const plain = results.find((row) => row.config === "plain hybrid");
  const translated = results.find((row) => row.config === "+ translation");

  if (plain && translated) {
    const delta = translated.mrr - plain.mrr;
    process.stdout.write(
      `\nQuery translation moves MRR by ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} ` +
        `(${plain.mrr.toFixed(3)} to ${translated.mrr.toFixed(3)}).\n`,
    );
    if (delta <= 0) {
      process.stdout.write(
        "That is not an improvement. On this corpus translation is not earning its\n" +
          "latency and QUERY_TRANSLATION_ENABLED should be false until it does.\n",
      );
    }
  }

  process.stdout.write("\n");
  await closeDb();
  await closeQueues();
}

main().catch((error: unknown) => {
  process.stderr.write(`\nEval failed: ${String(error)}\n\n`);
  process.exit(1);
});
