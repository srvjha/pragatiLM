import OpenAI from "openai";
import { env } from "@/config/env";

/**
 * Text to speech behind an interface, so swapping OpenAI for ElevenLabs touches
 * this file alone. Two voices, because the podcast is a two host conversation
 * and distinguishing the speakers is the whole point of the format.
 */
export type Voice = "female" | "male";

export interface TtsProvider {
  readonly name: string;
  synthesise(text: string, voice: Voice): Promise<Buffer>;
}

export class TtsError extends Error {}

export function createOpenAiTts(): TtsProvider {
  if (!env.OPENAI_API_KEY) {
    throw new TtsError("OPENAI_API_KEY is not set, so audio cannot be synthesised.");
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    name: "openai",
    async synthesise(text: string, voice: Voice): Promise<Buffer> {
      const response = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: voice === "female" ? env.TTS_VOICE_FEMALE : env.TTS_VOICE_MALE,
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
