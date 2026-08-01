import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitForRequest } from "@/providers/tts/sarvam";

/**
 * Bulbul is not the OpenAI audio API: different auth header, different field
 * names, a language code where OpenAI takes prose, and audio returned as base64
 * inside JSON rather than as bytes. Every one of those is a place where a wrong
 * value produces no error at all until somebody plays an episode, so the
 * request that leaves is what these assert.
 */

type Captured = { path: string; key?: string; body: Record<string, unknown> };

async function stubSarvam(reply?: (body: Record<string, unknown>) => unknown) {
  const calls: Captured[] = [];

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
      calls.push({
        path: request.url ?? "",
        ...(typeof request.headers["api-subscription-key"] === "string"
          ? { key: request.headers["api-subscription-key"] }
          : {}),
        body,
      });

      const payload = reply?.(body) ?? {
        request_id: "r-1",
        audios: [Buffer.from("ID3-part").toString("base64")],
      };

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * The endpoint is a constant rather than configuration — there is one Sarvam —
 * so the stub is put in its place by intercepting fetch rather than by pointing
 * a base url at it.
 */
async function providerAgainst(origin: string, overrides: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.doMock("@/config/env", () => ({
    env: {
      SARVAM_API_KEY: "sk-sarvam-test",
      SARVAM_MODEL: "bulbul:v3",
      TTS_PROVIDER: "sarvam",
      TTS_VOICES: undefined,
      TTS_VOICE_FEMALE: undefined,
      TTS_VOICE_MALE: undefined,
      ...overrides,
    },
  }));

  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    return real(url.replace("https://api.sarvam.ai", origin), init);
  });

  return import("@/providers/tts/sarvam");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/config/env");
  vi.resetModules();
});

describe("sarvam tts", () => {
  it("asks for Hindi, in mp3, with the pair's female speaker", async () => {
    const stub = await stubSarvam();

    try {
      const { createSarvamTts } = await providerAgainst(stub.origin);
      const audio = await createSarvamTts().synthesise("नमस्ते", "female", "warm", {
        language: "hi",
      });

      expect(stub.calls).toHaveLength(1);
      expect(stub.calls[0]?.path).toBe("/text-to-speech");
      expect(stub.calls[0]?.key).toBe("sk-sarvam-test");
      expect(stub.calls[0]?.body).toMatchObject({
        text: "नमस्ते",
        language_code: "hi-IN",
        model: "bulbul:v3",
        speaker: "kavya",
        output_audio_codec: "mp3",
      });
      // Decoded from base64 rather than handed on as a string.
      expect(audio.toString()).toBe("ID3-part");
    } finally {
      await stub.close();
    }
  });

  it("asks for Indian English, not plain English", async () => {
    const stub = await stubSarvam();

    try {
      const { createSarvamTts } = await providerAgainst(stub.origin);
      await createSarvamTts().synthesise("Hello there", "male", "warm", { language: "en" });

      expect(stub.calls[0]?.body).toMatchObject({ language_code: "en-IN", speaker: "shubh" });
    } finally {
      await stub.close();
    }
  });

  it("ignores the prose instructions the OpenAI models take", async () => {
    const stub = await stubSarvam();

    try {
      const { createSarvamTts } = await providerAgainst(stub.origin);
      await createSarvamTts().synthesise("Hello", "male", "bright", {
        language: "en",
        instructions: "Speak warmly",
      });

      expect(stub.calls[0]?.body).not.toHaveProperty("instructions");
      expect(stub.calls[0]?.body).toMatchObject({ speaker: "aditya" });
    } finally {
      await stub.close();
    }
  });

  it("splits a turn longer than a request and joins the audio back", async () => {
    const stub = await stubSarvam();

    try {
      const { createSarvamTts } = await providerAgainst(stub.origin);
      // Sentences, so the split has somewhere natural to fall.
      const long = "यह एक वाक्य है। ".repeat(400);
      const audio = await createSarvamTts().synthesise(long, "female", "warm", {
        language: "hi",
      });

      expect(stub.calls.length).toBeGreaterThan(1);
      for (const call of stub.calls) {
        expect(String(call.body.text).length).toBeLessThanOrEqual(2400);
      }
      // One buffer out, however many requests it took.
      expect(audio.toString()).toBe("ID3-part".repeat(stub.calls.length));
    } finally {
      await stub.close();
    }
  });

  it("refuses clearly when the service rejects the request", async () => {
    const stub = await stubSarvam();

    try {
      const { createSarvamTts } = await providerAgainst(stub.origin, {
        SARVAM_API_KEY: undefined,
      });

      expect(() => createSarvamTts()).toThrow(/dashboard\.sarvam\.ai/);
    } finally {
      await stub.close();
    }
  });
});

describe("splitForRequest", () => {
  it("leaves a turn that fits alone", () => {
    expect(splitForRequest("A short turn.", 100)).toEqual(["A short turn."]);
  });

  it("breaks on sentence ends, including the Devanagari danda", () => {
    const parts = splitForRequest("पहला वाक्य। दूसरा वाक्य। तीसरा वाक्य।", 20);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(20);
    // Nothing is lost in the split.
    expect(parts.join(" ").replace(/\s+/g, "")).toBe(
      "पहला वाक्य। दूसरा वाक्य। तीसरा वाक्य।".replace(/\s+/g, ""),
    );
  });

  it("falls back to spaces when one sentence is longer than a whole request", () => {
    const parts = splitForRequest(`${"word ".repeat(50)}end.`, 40);

    for (const part of parts) expect(part.length).toBeLessThanOrEqual(40);
    expect(parts.join(" ")).toContain("end.");
  });
});
