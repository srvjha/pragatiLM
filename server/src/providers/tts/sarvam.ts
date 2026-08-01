import { env } from "@/config/env";
import type { PodcastLanguage } from "@/types/domain";
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
 * Sarvam's Bulbul, for Hindi and Indian English.
 *
 * The OpenAI voices are English models reading whatever they are given: handed
 * Devanagari they apply English phonology and flat prosody, which is what makes
 * them sound robotic in Hindi and merely American in English. Bulbul is trained
 * on Indian languages, so this is not a cheaper substitute for the same thing —
 * it is the difference between a voice that can pronounce the text and one that
 * cannot.
 *
 * It does not speak the OpenAI audio API, which is the whole reason `TtsProvider`
 * exists as an interface rather than as a base URL.
 */
const ENDPOINT = "https://api.sarvam.ai/text-to-speech";

/**
 * Bulbul v3 accepts 2500 characters a request. A turn in a ten minute episode
 * runs to a few hundred, so this is headroom rather than a routine split — but
 * a script is written by a model and one long turn silently truncated would be
 * a sentence the listener never hears, which is worse than a seam.
 */
const MAX_CHARS = 2400;

const LANGUAGE_CODES: Record<PodcastLanguage, string> = {
  en: "en-IN",
  hi: "hi-IN",
};

export function createSarvamTts(): TtsProvider {
  const apiKey = env.SARVAM_API_KEY;

  if (!apiKey) {
    throw new TtsError(
      "SARVAM_API_KEY is not set, so audio cannot be synthesised. Keys come from https://dashboard.sarvam.ai.",
    );
  }

  async function speak(text: string, speaker: string, language: string): Promise<Buffer> {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey!,
      },
      body: JSON.stringify({
        text,
        speaker,
        language_code: language,
        model: env.SARVAM_MODEL,
        // mp3 rather than the wav default, so the episode is stitched and
        // stored in exactly the format everything downstream already expects.
        output_audio_codec: "mp3",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new TtsError(
        `Sarvam refused to synthesise (${response.status}). ${detail.slice(0, 300)}`,
      );
    }

    const body = (await response.json()) as { audios?: string[] };
    const parts = body.audios ?? [];

    if (parts.length === 0) {
      throw new TtsError("Sarvam returned no audio for a turn.");
    }

    return Buffer.concat(parts.map((part) => Buffer.from(part, "base64")));
  }

  return {
    name: "sarvam",

    synthesise: async (
      text: string,
      voice: Voice,
      pair: VoicePair = DEFAULT_VOICE_PAIR,
      options: SpeakOptions = {},
    ): Promise<Buffer> => {
      const voices = VOICE_PAIRS[pair] ?? VOICE_PAIRS[DEFAULT_VOICE_PAIR];
      const speaker = voice === "female" ? voices.female : voices.male;
      const language = LANGUAGE_CODES[options.language ?? "en"];

      // Concatenated rather than re-encoded: every part comes back from the
      // same model at the same settings, and mp3 frames are self contained, so
      // joining them is what ffmpeg would do to the files anyway.
      const chunks = splitForRequest(text);
      const audio: Buffer[] = [];

      for (const chunk of chunks) {
        audio.push(await speak(chunk, speaker, language));
      }

      return Buffer.concat(audio);
    },
  };
}

/**
 * Splits on sentence ends, then on spaces, and only ever mid-word when a single
 * "word" is longer than a whole request — which is a URL or a hash rather than
 * speech, and cutting it is already the least bad option.
 */
export function splitForRequest(text: string, limit = MAX_CHARS): string[] {
  if (text.length <= limit) return [text];

  const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim().length > 0) chunks.push(current.trim());
    current = "";
  };

  for (const sentence of sentences) {
    if (current.length + sentence.length <= limit) {
      current += sentence;
      continue;
    }

    push();

    if (sentence.length <= limit) {
      current = sentence;
      continue;
    }

    // One sentence longer than a request: break it on spaces instead.
    let rest = sentence;
    while (rest.length > limit) {
      const cut = rest.lastIndexOf(" ", limit);
      const at = cut > limit / 2 ? cut : limit;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at);
    }
    current = rest;
  }

  push();
  return chunks;
}
