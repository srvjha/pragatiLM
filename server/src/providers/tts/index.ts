import { env } from "@/config/env";
import { createOpenAiTts } from "./openai";
import { createSarvamTts } from "./sarvam";
import type { TtsProvider } from "./contract";

export * from "./contract";
export { createOpenAiTts } from "./openai";
export { createSarvamTts } from "./sarvam";

let provider: TtsProvider | null = null;

/**
 * The service that speaks, chosen once per process by `TTS_PROVIDER`. Pick
 * `sarvam` for Hindi or Indian English; anything OpenAI-shaped is the default.
 */
export function ttsProvider(): TtsProvider {
  provider ??= env.TTS_PROVIDER === "sarvam" ? createSarvamTts() : createOpenAiTts();
  return provider;
}

export function setTtsProvider(next: TtsProvider | null): void {
  provider = next;
}
