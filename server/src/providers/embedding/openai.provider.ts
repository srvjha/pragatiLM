import { OpenAIEmbeddings } from "@langchain/openai";
import pLimit from "p-limit";
import pRetry from "p-retry";
import { env } from "@/config/env";
import { childLogger } from "@/lib/logger";
import { EmbeddingError, type EmbeddingProvider } from "./types";

const log = childLogger("embeddings");

/** FR-3.5: batches of 96, concurrency 4, retry with exponential backoff. */
const BATCH_SIZE = 96;
const CONCURRENCY = 4;

export function createOpenAIEmbeddingProvider(): EmbeddingProvider {
  if (!env.OPENAI_API_KEY) {
    throw new EmbeddingError(
      "OPENAI_API_KEY is not set. Add it to server/.env before indexing a source.",
    );
  }

  const client = new OpenAIEmbeddings({
    apiKey: env.OPENAI_API_KEY,
    model: env.EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIM,
    // Batching is handled here so that a failure retries one batch rather than
    // the whole source.
    maxConcurrency: 1,
    maxRetries: 0,
  });

  const limit = pLimit(CONCURRENCY);

  async function embedBatch(batch: string[], index: number): Promise<number[][]> {
    return pRetry(() => client.embedDocuments(batch), {
      retries: 4,
      factor: 2,
      minTimeout: 1_000,
      maxTimeout: 20_000,
      onFailedAttempt: (context) => {
        log.warn(
          { batch: index, attempt: context.attemptNumber, left: context.retriesLeft },
          `embedding batch failed: ${context.error.message}`,
        );
      },
    });
  }

  return {
    model: env.EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIM,

    async embedDocuments(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const batches: string[][] = [];
      for (let index = 0; index < texts.length; index += BATCH_SIZE) {
        batches.push(texts.slice(index, index + BATCH_SIZE));
      }

      const results = await Promise.all(
        batches.map((batch, index) => limit(() => embedBatch(batch, index))),
      );

      const vectors = results.flat();

      // A provider returning the wrong count would silently misalign every
      // chunk with someone else's vector.
      if (vectors.length !== texts.length) {
        throw new EmbeddingError(
          `Expected ${texts.length} embeddings but received ${vectors.length}.`,
        );
      }

      return vectors;
    },

    async embedQuery(text: string): Promise<number[]> {
      return pRetry(() => client.embedQuery(text), { retries: 3, factor: 2, minTimeout: 500 });
    },
  };
}
