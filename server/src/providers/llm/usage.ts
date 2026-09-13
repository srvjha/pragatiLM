import { AsyncLocalStorage } from "node:async_hooks";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { db } from "@/db/client";
import { llmUsage } from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { costMicros } from "./pricing";
import type { ModelRole } from "./index";

const log = childLogger("llm:usage");

/**
 * Who and what a model call belongs to.
 *
 * Model calls happen four layers below the request that caused them, and
 * threading a userId through translate, route, grade and the corrective loop
 * would mean touching every signature to carry something none of them use.
 * AsyncLocalStorage keeps the plumbing at the two ends: the worker opens a
 * context, the callback reads it.
 */
export type UsageContext = { userId: string | null; feature: string };

const storage = new AsyncLocalStorage<UsageContext>();

/** Runs `fn` with every model call inside it attributed to this user and feature. */
export function withUsageContext<T>(context: UsageContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function currentUsageContext(): UsageContext {
  return storage.getStore() ?? { userId: null, feature: "unattributed" };
}

type TokenCounts = { prompt: number; completion: number; total: number };

/**
 * Digs the token counts out of whatever shape the response arrived in.
 *
 * LangChain has carried usage in three different places across versions and
 * providers, and a structured-output call wraps the response again. Checking
 * all of them is not defensive programming for its own sake: when this returns
 * zeros the row still gets written, and a table full of zero-token rows looks
 * exactly like a product nobody is using.
 */
function tokensFrom(output: unknown): TokenCounts {
  const empty = { prompt: 0, completion: 0, total: 0 };
  if (!output || typeof output !== "object") return empty;

  const root = output as Record<string, unknown>;
  const generations = root.generations as unknown[][] | undefined;
  const first = generations?.[0]?.[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    (root.llmOutput as Record<string, unknown> | undefined)?.tokenUsage,
    (root.llmOutput as Record<string, unknown> | undefined)?.estimatedTokenUsage,
    message?.usage_metadata,
    (message?.response_metadata as Record<string, unknown> | undefined)?.usage,
    (message?.response_metadata as Record<string, unknown> | undefined)?.tokenUsage,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const usage = candidate as Record<string, number>;
    const prompt = usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const completion =
      usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens ?? 0;
    const total = usage.totalTokens ?? usage.total_tokens ?? prompt + completion;
    if (prompt || completion || total) return { prompt, completion, total };
  }

  return empty;
}

/**
 * Records one row per model call.
 *
 * Never throws. This is diagnostic: a telemetry write that could fail a user's
 * question would be a strictly worse product than having no telemetry, and the
 * first time it happened would be during an incident.
 */
export function usageCallback(role: ModelRole, model: string): BaseCallbackHandler {
  const started = new Map<string, number>();

  const record = async (
    runId: string,
    tokens: TokenCounts,
    error: string | null,
  ): Promise<void> => {
    const begun = started.get(runId);
    started.delete(runId);
    const { userId, feature } = currentUsageContext();

    try {
      await db.insert(llmUsage).values({
        userId,
        feature,
        role,
        model,
        promptTokens: tokens.prompt,
        completionTokens: tokens.completion,
        totalTokens: tokens.total,
        costMicros: costMicros(model, tokens.prompt, tokens.completion),
        latencyMs: begun ? Math.round(performance.now() - begun) : 0,
        error,
      });
    } catch (writeError) {
      log.warn({ err: writeError, feature, model }, "could not record model usage");
    }
  };

  // Written as a plain object rather than a class so it needs no import of
  // LangChain's abstract base, which moves between versions.
  return {
    name: "pragatilm-usage",
    awaitHandlers: false,
    ignoreLLM: false,
    ignoreChain: true,
    ignoreAgent: true,
    ignoreRetriever: true,
    handleLLMStart(_llm: unknown, _prompts: string[], runId: string) {
      started.set(runId, performance.now());
    },
    handleLLMEnd(output: unknown, runId: string) {
      void record(runId, tokensFrom(output), null);
    },
    handleLLMError(error: unknown, runId: string) {
      const message = error instanceof Error ? error.message : String(error);
      void record(runId, { prompt: 0, completion: 0, total: 0 }, message.slice(0, 300));
    },
  } as unknown as BaseCallbackHandler;
}
