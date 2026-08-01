import OpenAI from "openai";
import { env } from "@/config/env";

/**
 * Text to speech behind an interface, so swapping the service that speaks the
 * words touches this file alone. Two voices, because the podcast is a two host
 * conversation and distinguishing the speakers is the whole point of the
 * format.
 */
export type Voice = "female" | "male";

/**
 * FR-7.1. The voice pairing offered when creating an episode.
 *
 * A pair rather than two independent pickers, because the thing that matters in
 * a two host format is that the voices are distinguishable from each other, and
 * that is a property of the combination. `warm` is the pair the environment
 * configures, so an existing TTS_VOICE_FEMALE and TTS_VOICE_MALE still name the
 * default; the others are fixed alternatives.
 */
export const VOICE_PAIRS = {
  warm: { label: "Warm", female: env.TTS_VOICE_FEMALE, male: env.TTS_VOICE_MALE },
  bright: { label: "Bright", female: "shimmer", male: "echo" },
  calm: { label: "Calm", female: "sage", male: "ash" },
} as const;

export type VoicePair = keyof typeof VOICE_PAIRS;

export const VOICE_PAIR_IDS = Object.keys(VOICE_PAIRS) as [VoicePair, ...VoicePair[]];

export const DEFAULT_VOICE_PAIR: VoicePair = "warm";

export interface TtsProvider {
  readonly name: string;
  synthesise(text: string, voice: Voice, pair?: VoicePair): Promise<Buffer>;
}

export class TtsError extends Error {}

export function createOpenAiTts(): TtsProvider {
  if (!env.OPENAI_API_KEY) {
    throw new TtsError("OPENAI_API_KEY is not set, so audio cannot be synthesised.");
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    name: "openai",
    async synthesise(text: string, voice: Voice, pair = DEFAULT_VOICE_PAIR): Promise<Buffer> {
      const voices = VOICE_PAIRS[pair] ?? VOICE_PAIRS[DEFAULT_VOICE_PAIR];

      const response = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: voice === "female" ? voices.female : voices.male,
        input: text,
        response_format: "mp3",
      });

      return Buffer.from(await response.arrayBuffer());
    },
  };
}

let provider: TtsProvider | null = null;

export function ttsProvider(): TtsProvider {
  provider ??= createOpenAiTts();
  return provider;
}

export function setTtsProvider(next: TtsProvider | null): void {
  provider = next;
}
