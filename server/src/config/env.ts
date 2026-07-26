import "dotenv/config";
import { z } from "zod";

const booleanish = z.enum(["true", "false"]).transform((value) => value === "true");

/**
 * A blank value means unset, not invalid. `.env.example` ships keys with an
 * empty value, and a commented out variable arriving as "" should read the same
 * as a missing one rather than failing startup.
 */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const port = z.coerce.number().int().positive().max(65535);
const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().nonnegative();

/**
 * Infrastructure values are required: without them nothing boots and failing at
 * startup is cheaper than failing at the first request. Model keys are optional
 * here because the API and worker must start and report health before any key
 * exists. They become required at the step that first calls a model, and the
 * check moves to the provider that needs them.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: port.default(4000),
  WEB_ORIGIN: z.url(),
  WORKER_QUEUES: z
    .string()
    .default("chat,ingest,cleanup,roadmap,podcast")
    .transform((value) =>
      value
        .split(",")
        .map((queue) => queue.trim())
        .filter(Boolean),
    ),
  CHAT_QUEUE_CONCURRENCY: positiveInt.default(8),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_READONLY: optionalString,

  REDIS_URL: z.string().min(1),

  QDRANT_URL: z.url(),
  QDRANT_API_KEY: optionalString,
  QDRANT_COLLECTION: z.string().min(1).default("chunks"),

  // "fake" swaps in a deterministic stand in so the product can be run and
  // demoed with no API key. It is an explicit opt in, never a silent fallback,
  // because its vectors carry no meaning: ingestion and the UI work end to end,
  // and retrieval returns nonsense.
  EMBEDDING_PROVIDER: z.enum(["openai", "fake"]).default("openai"),
  OPENAI_API_KEY: optionalString,
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIM: positiveInt.default(1536),
  CHAT_MODEL: z.string().default("gpt-4.1-mini"),
  QUERY_MODEL: z.string().default("gpt-4.1-nano"),
  GRADER_MODEL: z.string().default("gpt-4.1-nano"),
  COHERE_API_KEY: optionalString,
  RERANK_ENABLED: booleanish.default(true),

  TTS_PROVIDER: z.enum(["openai", "elevenlabs"]).default("openai"),
  TTS_VOICE_FEMALE: z.string().default("nova"),
  TTS_VOICE_MALE: z.string().default("onyx"),
  ELEVENLABS_API_KEY: optionalString,

  CHUNK_TARGET_TOKENS: positiveInt.default(900),
  CHUNK_OVERLAP_TOKENS: nonNegativeInt.default(150),

  QUERY_TRANSLATION_ENABLED: booleanish.default(true),
  REWRITE_ENABLED: booleanish.default(true),
  STEPBACK_ENABLED: booleanish.default(true),
  SUBQUESTIONS_ENABLED: booleanish.default(true),
  SUBQUESTION_MAX: positiveInt.default(3),
  HYDE_ENABLED: booleanish.default(true),

  QUERY_ROUTING_ENABLED: booleanish.default(true),
  SQL_ROUTE_ENABLED: booleanish.default(true),
  SQL_MAX_ROWS: positiveInt.default(50),
  SQL_TIMEOUT_MS: positiveInt.default(2000),
  RRF_K: positiveInt.default(60),
  RETRIEVAL_TOP_K: positiveInt.default(30),
  RERANK_TOP_N: positiveInt.default(8),
  RELEVANCE_FLOOR: z.coerce.number().min(0).max(1).default(0.25),

  CRAG_ENABLED: booleanish.default(true),
  CRAG_MIN_SCORE: z.coerce.number().min(0).max(10).default(6),
  CRAG_MAX_RETRIES: nonNegativeInt.default(3),
  CRAG_WALL_CLOCK_MS: positiveInt.default(15000),

  MAX_UPLOAD_MB: positiveInt.default(50),
});

export type Env = z.infer<typeof schema>;

function parseEnv(): Env {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    process.stderr.write(
      `\nInvalid environment configuration:\n${problems}\n\n` +
        `Copy server/.env.example to server/.env and fill in the missing values.\n\n`,
    );
    process.exit(1);
  }

  if (result.data.CHUNK_OVERLAP_TOKENS >= result.data.CHUNK_TARGET_TOKENS) {
    process.stderr.write(
      `\nInvalid environment configuration:\n` +
        `  CHUNK_OVERLAP_TOKENS must be smaller than CHUNK_TARGET_TOKENS\n\n`,
    );
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();

export const isDevelopment = env.NODE_ENV === "development";
