import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The TTS backend is chosen entirely by environment, and getting it wrong is
 * silent until someone waits several minutes for an episode and gets a 400 from
 * a service that has never heard of the voice it was asked for. These tests
 * stand a stub in for the backend and assert the request that reaches it.
 */

type Captured = { path: string; body: Record<string, unknown>; authorization?: string };

/** A stub speech endpoint that records what it was asked for. */
async function stubBackend(): Promise<{
  url: string;
  calls: Captured[];
  close: () => Promise<void>;
}> {
  const calls: Captured[] = [];

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      calls.push({
        path: request.url ?? "",
        body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
      });

      response.writeHead(200, { "Content-Type": "audio/mpeg" });
      response.end(Buffer.from("ID3-not-really-audio"));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/v1`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * The provider reads its configuration once, at import, because the voice pairs
 * it derives are exported to the route that lists them. So a test that wants a
 * different backend has to import it again.
 */
async function providerWith(overrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("@/config/env", () => ({
    env: {
      OPENAI_API_KEY: "sk-test",
      TTS_BASE_URL: undefined,
      TTS_API_KEY: undefined,
      TTS_MODEL: "gpt-4o-mini-tts",
      TTS_VOICES: "openai",
      TTS_VOICE_FEMALE: undefined,
      TTS_VOICE_MALE: undefined,
      ...overrides,
    },
  }));

  return import("@/providers/tts");
}

afterEach(() => {
  vi.doUnmock("@/config/env");
  vi.resetModules();
});

describe("tts provider", () => {
  it("asks OpenAI for its own voices when no base url is set", async () => {
    const backend = await stubBackend();

    try {
      const { createTts, VOICE_PAIRS } = await providerWith({ TTS_BASE_URL: backend.url });

      expect(VOICE_PAIRS.warm.female).toBe("nova");
      expect(VOICE_PAIRS.calm.male).toBe("ash");

      const audio = await createTts().synthesise("Hello there.", "female");

      expect(backend.calls).toHaveLength(1);
      expect(backend.calls[0]?.path).toBe("/v1/audio/speech");
      expect(backend.calls[0]?.body).toMatchObject({
        model: "gpt-4o-mini-tts",
        voice: "nova",
        input: "Hello there.",
        response_format: "mp3",
      });
      expect(audio.toString()).toBe("ID3-not-really-audio");
    } finally {
      await backend.close();
    }
  });

  it("sends Kokoro's voice names and model when pointed at a Kokoro backend", async () => {
    const backend = await stubBackend();

    try {
      const { createTts, VOICE_PAIRS } = await providerWith({
        TTS_BASE_URL: backend.url,
        TTS_API_KEY: "di-test",
        TTS_MODEL: "hexgrad/Kokoro-82M",
        TTS_VOICES: "kokoro",
      });

      // The ids the product offers are unchanged; only the voices behind them
      // differ, so an episode recorded as "calm" still means something.
      expect(Object.keys(VOICE_PAIRS)).toEqual(["warm", "bright", "calm"]);
      expect(VOICE_PAIRS.warm.female).toBe("af_heart");

      const tts = createTts();
      await tts.synthesise("First.", "male", "bright");
      await tts.synthesise("Second.", "female", "calm");

      expect(backend.calls[0]?.body).toMatchObject({
        model: "hexgrad/Kokoro-82M",
        voice: "am_puck",
      });
      expect(backend.calls[1]?.body).toMatchObject({ voice: "bf_emma" });
      // Its own key, not the OpenAI one.
      expect(backend.calls[0]?.authorization).toBe("Bearer di-test");
    } finally {
      await backend.close();
    }
  });

  it("lets the environment pin the warm pair without touching the others", async () => {
    const { VOICE_PAIRS } = await providerWith({
      TTS_VOICES: "kokoro",
      TTS_VOICE_FEMALE: "af_bella",
      TTS_VOICE_MALE: "am_fenrir",
    });

    expect(VOICE_PAIRS.warm).toMatchObject({ female: "af_bella", male: "am_fenrir" });
    expect(VOICE_PAIRS.calm).toMatchObject({ female: "bf_emma", male: "bm_george" });
  });

  it("refuses to synthesise when nothing has a key", async () => {
    const { createTts, TtsError } = await providerWith({
      OPENAI_API_KEY: undefined,
      TTS_BASE_URL: "https://api.deepinfra.com/v1/openai",
    });

    expect(() => createTts()).toThrow(TtsError);
  });
});
