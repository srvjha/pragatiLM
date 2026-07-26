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
  // One or more origins, comma separated. A list rather than a single value
  // because the web app and the API are separate deployments: a preview build,
  // a local client that landed on a different port, and production are all
  // legitimately different origins talking to the same API.
  WEB_ORIGIN: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean),
    )
    .refine((origins) => origins.length > 0, "at least one origin is required")
    .refine(
      (origins) => origins.every((origin) => URL.canParse(origin)),
      "every origin must be a full URL, for example http://localhost:3000",
    ),
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

  // Signs session cookies. Required in production; see parseEnv below for why
  // development is allowed to fall back rather than refuse to boot.
  BETTER_AUTH_SECRET: optionalString,
  // Where the auth routes are reachable, which is this API rather than the web
  // app. OAuth callbacks are built from it, so it has to be the public URL once
  // this is deployed behind a proxy.
  BETTER_AUTH_URL: z.url().default("http://localhost:4000"),
  // Social sign in is optional. A provider whose id and secret are both present
  // is registered and appears on the sign in page; one left blank does not
  // exist as far as the client is concerned, so no button is shown for it.
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  // Set this only when the web app and the API sit on different registrable
  // domains, for example a web app on one hosting provider's subdomain and the
  // API on another's. It switches the session cookie to SameSite=None, which
  // browsers only accept over HTTPS, so it forces Secure on with it.
  AUTH_COOKIE_CROSS_SITE: booleanish.default(false),

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

  if (result.data.NODE_ENV === "production" && !result.data.BETTER_AUTH_SECRET) {
    process.stderr.write(
      `\nInvalid environment configuration:\n` +
        `  BETTER_AUTH_SECRET is required in production.\n` +
        `  Generate one with: openssl rand -base64 32\n\n`,
    );
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();

export const isDevelopment = env.NODE_ENV === "development";

/**
 * The session signing key.
 *
 * Outside production a missing secret falls back to a fixed development value,
 * because the product ships with `.env.example` blank and has to run before
 * anyone has generated anything. The fallback is deliberately named for what it
 * is: sessions signed with it are worthless, which is the point, and production
 * refuses to start without a real one rather than reaching this line.
 */
export const authSecret =
  env.BETTER_AUTH_SECRET ?? "development-only-insecure-secret-do-not-deploy";

/** A social provider exists only when both halves of its credential are set. */
export const socialProviders = {
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
} as const;
