import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/config/env";

/**
 * Chat models behind one accessor. Three roles, deliberately separate: answering
 * runs on CHAT_MODEL, query translation and grading run on smaller, faster
 * models, because they are structured tasks on a short input and paying for the
 * answering model there would show up directly in time to first token.
 */
export type ModelRole = "chat" | "query" | "grader" | "translator";

const modelNames: Record<ModelRole, () => string> = {
  chat: () => env.CHAT_MODEL,
  query: () => env.QUERY_MODEL,
  grader: () => env.GRADER_MODEL,
  // Subtitle translation is mechanical and highly parallel, and it is the one
  // model call a reader waits on with nothing else on screen, so it runs on
  // the cheapest model by default. Unlike the grader, a weak result here is
  // visible and correctable rather than silent: the reader can see the
  // translation is poor and switch back to the original track.
  translator: () => env.TRANSLATE_MODEL,
};

const cache = new Map<ModelRole, ChatOpenAI>();

/**
 * Whether a real model can be called.
 *
 * False under test regardless of what is in `.env`, which mirrors what the
 * embedding provider already does. Without this the suite quietly changes
 * behaviour depending on whether the developer happens to have a working key:
 * every stage that consults a model would make real network calls, and the
 * tests written against the deterministic fallback paths would fail on a
 * machine where the key works and pass on one where it does not. A test that
 * depends on a missing credential is a test that proves nothing.
 *
 * Real models are exercised by `npm run eval`, which is a script for exactly
 * that reason.
 */
export function hasLlmCredentials(): boolean {
  if (env.NODE_ENV === "test") return false;
  return Boolean(env.OPENAI_API_KEY);
}

export function chatModel(role: ModelRole, temperature = 0): ChatOpenAI {
  const existing = cache.get(role);
  if (existing) return existing;

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set, so no model call can be made.");
  }

  const model = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY,
    model: modelNames[role](),
    temperature,
    maxRetries: 2,
  });

  cache.set(role, model);
  return model;
}

/** Tests replace the model rather than the network. */
export function setChatModel(role: ModelRole, model: ChatOpenAI | null): void {
  if (model) cache.set(role, model);
  else cache.delete(role);
}
