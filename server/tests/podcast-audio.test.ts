import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "@/app";
import { db } from "@/db/client";
import { podcasts, podcastAudio } from "@/db/schema";
import type { NotebookDto } from "@/types/api";
import { signedIn } from "./auth-helper";

/**
 * Serving the episode, which is the half of the podcast feature that has
 * nothing to do with generating one.
 *
 * The route advertises `Accept-Ranges: bytes`, and a media element takes that
 * literally: Chrome asks for a range to seek with, and Safari asks for one
 * before it will play at all. Answering every such request with the whole body
 * and a 200 is a promise the response then breaks, and the failure is a player
 * that silently does nothing on one browser while working on another.
 */

const app = createApp();

const BODY = Buffer.from("ID3" + "x".repeat(997));

let agent: Awaited<ReturnType<typeof signedIn>>;
let notebookId: string;
let podcastId: string;

beforeEach(async () => {
  agent = await signedIn(app);

  const created = await agent.post("/api/notebooks").send({ name: "Episodes" });
  notebookId = (created.body as { data: NotebookDto }).data.id;

  const [podcast] = await db
    .insert(podcasts)
    .values({
      notebookId,
      title: "An episode",
      status: "READY",
      stage: "READY",
      progress: 100,
      durationSec: 12,
    })
    .returning();

  podcastId = podcast!.id;

  await db.insert(podcastAudio).values({
    podcastId,
    mimeType: "audio/mpeg",
    sizeBytes: BODY.length,
    bytes: BODY,
  });
});

const url = () => `/api/notebooks/${notebookId}/podcasts/${podcastId}/audio`;

describe("GET /api/notebooks/:id/podcasts/:id/audio", () => {
  it("returns the whole episode when nothing is asked for", async () => {
    const response = await agent.get(url());

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-length"]).toBe(String(BODY.length));
    expect(Buffer.from(response.body as Buffer)).toEqual(BODY);
  });

  it("answers a range with the bytes asked for and a 206", async () => {
    const response = await agent.get(url()).set("Range", "bytes=0-9");

    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toBe(`bytes 0-9/${BODY.length}`);
    expect(response.headers["content-length"]).toBe("10");
    expect(Buffer.from(response.body as Buffer)).toEqual(BODY.subarray(0, 10));
  });

  it("reads an open ended range to the end of the episode", async () => {
    const response = await agent.get(url()).set("Range", "bytes=990-");

    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toBe(`bytes 990-999/${BODY.length}`);
    expect(Buffer.from(response.body as Buffer)).toEqual(BODY.subarray(990));
  });

  it("reads a suffix range as the last bytes, not a range starting at nothing", async () => {
    const response = await agent.get(url()).set("Range", "bytes=-5");

    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toBe(`bytes 995-999/${BODY.length}`);
    expect(Buffer.from(response.body as Buffer)).toEqual(BODY.subarray(995));
  });

  it("refuses a range that starts past the end", async () => {
    const response = await agent.get(url()).set("Range", "bytes=5000-6000");

    expect(response.status).toBe(416);
    expect(response.headers["content-range"]).toBe(`bytes */${BODY.length}`);
  });

  /**
   * The reason the player carries `crossOrigin="use-credentials"`: without it a
   * media element sends no session cookie, this is the response it gets, and
   * the only symptom is a format error on something that was never audio.
   */
  it("refuses to serve an episode to a request with no session", async () => {
    // A bare client rather than the signed in agent: this is the request a
    // media element makes when it has not been told to carry the session.
    const response = await request(app).get(url());

    expect(response.status).toBe(401);
  });
});
