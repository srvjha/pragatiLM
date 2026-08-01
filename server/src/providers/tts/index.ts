import OpenAI from "openai";
import { env } from "@/config/env";

/**
 * Text to speech behind an interface, so swapping the service that speaks the
 * words touches this file alone. Two voices, because the podcast is a two host
 * conversation and distinguishing the speakers is the whole point of the
 * format.
 *
 * Every backend worth using speaks the OpenAI audio API, so there is one
 * implementation and `TTS_BASE_URL` chooses where it points:
 *
 *   unset                                  OpenAI itself
 *   https://api.deepinfra.com/v1/openai    Kokoro on DeepInfra, per character
 *   http://kokoro:8880/v1                  Kokoro in a container you run
 *
 * What changes between them is the model name and the voice names, which is
 * what `TTS_MODEL` and `TTS_VOICES` are for.
 */
export type Voice = "female" | "male";

/**
 * FR-7.1. The voice pairing offered when creating an episode.
 *
 * A pair rather than two independent pickers, because the thing that matters in
 * a two host format is that the voices are distinguishable from each other, and
 * that is a property of the combination.
 *
 * The three ids are the product's own vocabulary and never change: an episode
 * records the id it was made with, so a podcast generated last month has to
 * still mean something after the backend behind it has been swapped. Only the
 * names underneath are per backend.
 */
const VOICE_SETS = {
  openai: {
    warm: { female: "nova", male: "onyx" },
    bright: { female: "shimmer", male: "echo" },
    calm: { female: "sage", male: "ash" },
  },
  /**
   * Kokoro ships 54 voices of wildly uneven quality, graded A to F on its own
   * voice card, and most of them are not usable. These are the best of each
   * register: af_heart is the only A, af_bella the only A-, and the male voices
   * top out at C+, so the pairs are built around the strongest female voice
   * available and the least synthetic male one. `calm` is the British pair,
   * which is a genuinely different register rather than a third American one.
   */
  kokoro: {
    warm: { female: "af_heart", male: "am_michael" },
    bright: { female: "af_bella", male: "am_puck" },
    calm: { female: "bf_emma", male: "bm_george" },
  },
} as const;

const LABELS = { warm: "Warm", bright: "Bright", calm: "Calm" } as const;

export type VoicePair = keyof typeof LABELS;

const set = VOICE_SETS[env.TTS_VOICES];

export const VOICE_PAIRS = {
  warm: {
    label: LABELS.warm,
    // The one pair the environment can name directly, so a deployment that
    // already pinned these two keeps the voices it had.
    female: env.TTS_VOICE_FEMALE ?? set.warm.female,
    male: env.TTS_VOICE_MALE ?? set.warm.male,
  },
  bright: { label: LABELS.bright, ...set.bright },
  calm: { label: LABELS.calm, ...set.calm },
} as const;

export const VOICE_PAIR_IDS = Object.keys(VOICE_PAIRS) as [VoicePair, ...VoicePair[]];

export const DEFAULT_VOICE_PAIR: VoicePair = "warm";

export interface TtsProvider {
  readonly name: string;
  synthesise(text: string, voice: Voice, pair?: VoicePair): Promise<Buffer>;
}

export class TtsError extends Error {}

export function createTts(): TtsProvider {
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
    async synthesise(text: string, voice: Voice, pair = DEFAULT_VOICE_PAIR): Promise<Buffer> {
      const voices = VOICE_PAIRS[pair] ?? VOICE_PAIRS[DEFAULT_VOICE_PAIR];

      const response = await client.audio.speech.create({
        model: env.TTS_MODEL,
        voice: voice === "female" ? voices.female : voices.male,
        input: text,
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

let provider: TtsProvider | null = null;

export function ttsProvider(): TtsProvider {
  provider ??= createTts();
  return provider;
}

export function setTtsProvider(next: TtsProvider | null): void {
  provider = next;
}
