import OpenAI from "openai";
import { env } from "@/config/env";
import {
  DEFAULT_VOICE_PAIR,
  TtsError,
  VOICE_PAIRS,
  type SpeakOptions,
  type TtsProvider,
  type Voice,
  type VoicePair,
} from "./contract";

/**
 * Everything that speaks the OpenAI audio API: OpenAI itself, Kokoro on a
 * per-character host, or a Kokoro container on the internal network. Which one
 * is a matter of `TTS_BASE_URL`, not of code.
 */

/**
 * Whether this backend understands `instructions`.
 *
 * Only OpenAI's steerable speech models take it. Kokoro ignores what it does
 * not recognise in some builds and rejects it in others, and a field that
 * fails one turn in thirty is worse than one that is never sent, so it goes
 * only where it is known to be read.
 */
const steerable = () => /^gpt-4o.*-tts$/.test(env.TTS_MODEL);

export function createOpenAiTts(): TtsProvider {
  // A self-hosted container ignores the key entirely, but the SDK requires a
  // string, so the OpenAI key stands in when no separate one is configured.
  const apiKey = env.TTS_API_KEY ?? env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new TtsError(
      "No TTS credentials are set, so audio cannot be synthesised. Set TTS_API_KEY, or OPENAI_API_KEY to use OpenAI.",
    );
  }

  const client = new OpenAI({
    apiKey,
    ...(env.TTS_BASE_URL ? { baseURL: env.TTS_BASE_URL } : {}),
  });

  return {
    name: env.TTS_BASE_URL ?? "openai",

    synthesise: async (
      text: string,
      voice: Voice,
      pair: VoicePair = DEFAULT_VOICE_PAIR,
      options: SpeakOptions = {},
    ): Promise<Buffer> => {
      const voices = VOICE_PAIRS[pair] ?? VOICE_PAIRS[DEFAULT_VOICE_PAIR];

      const response = await client.audio.speech.create({
        model: env.TTS_MODEL,
        voice: voice === "female" ? voices.female : voices.male,
        input: text,
        ...(options.instructions && steerable() ? { instructions: options.instructions } : {}),
        // Every backend here returns mp3 on request, which is what the episode
        // is stitched and stored as. A backend that ignored this and returned
        // wav would still concatenate, but the stored bytes would no longer
        // match the audio/mpeg the player is told to expect.
        response_format: "mp3",
      });

      return Buffer.from(await response.arrayBuffer());
    },
  };
}
