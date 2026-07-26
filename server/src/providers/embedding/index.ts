import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { createOpenAIEmbeddingProvider } from "./openai.provider";
import { createFakeEmbeddingProvider } from "./fake.provider";
import type { EmbeddingProvider } from "./types";

let provider: EmbeddingProvider | null = null;

/**
 * The factory. Built lazily so that the API and worker still start, and still
 * report health, when no key is configured; the failure then happens at the
 * point of use with a message naming the missing variable.
 */
export function embeddingProvider(): EmbeddingProvider {
  if (provider) return provider;

  const useFake = env.NODE_ENV === "test" || env.EMBEDDING_PROVIDER === "fake";

  if (useFake) {
    if (env.NODE_ENV !== "test") {
      logger.warn(
        "EMBEDDING_PROVIDER=fake: embeddings are deterministic placeholders. Ingestion and the UI work, retrieval does not return meaningful results.",
      );
    }
    provider = createFakeEmbeddingProvider(env.EMBEDDING_DIM);
  } else {
    provider = createOpenAIEmbeddingProvider();
  }

  return provider;
}

/** Used by tests to inject a stand in. */
export function setEmbeddingProvider(next: EmbeddingProvider | null): void {
  provider = next;
}

export * from "./types";
export { createFakeEmbeddingProvider } from "./fake.provider";
export { createOpenAIEmbeddingProvider } from "./openai.provider";
