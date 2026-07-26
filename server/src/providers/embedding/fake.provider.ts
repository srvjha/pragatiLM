import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./types";

/**
 * A deterministic stand in, used by the test suite and by anyone running the
 * project without an API key. Vectors are derived from the text, so identical
 * text embeds identically and similar text does not: it exercises every code
 * path around embedding without pretending to be a semantic model.
 *
 * Never selected implicitly. The factory picks it only when explicitly asked.
 */
export function createFakeEmbeddingProvider(dimensions = 1536): EmbeddingProvider {
  function embed(text: string): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    // Several hash rounds so the vector is spread across its dimensions rather
    // than clustered in the first 32.
    for (let round = 0; round < 8; round += 1) {
      const digest = createHash("sha256").update(`${round}:${text}`).digest();
      for (let index = 0; index < digest.length; index += 1) {
        const slot = (round * digest.length + index) % dimensions;
        vector[slot] = ((digest[index] ?? 0) - 128) / 128;
      }
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / magnitude);
  }

  return {
    model: "fake-deterministic",
    dimensions,
    embedDocuments: (texts) => Promise.resolve(texts.map(embed)),
    embedQuery: (text) => Promise.resolve(embed(text)),
  };
}
