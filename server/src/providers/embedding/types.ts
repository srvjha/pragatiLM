/**
 * The provider interface. Swapping OpenAI for another embedding model touches
 * one file, and the model name plus dimension are stamped on every chunk so a
 * change is detectable rather than silently mixing vector spaces.
 */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  /** Embeds many texts. Batching and concurrency are the implementation's business. */
  embedDocuments(texts: string[]): Promise<number[][]>;

  /** Embeds one query. Some providers distinguish the two; this one does not. */
  embedQuery(text: string): Promise<number[]>;
}

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}
