import { describe, expect, it } from "vitest";
import {
  HINGLISH,
  TRANSLATED_ENGLISH,
  indexedTrack,
  offeredTracks,
} from "@/services/captions.service";
import type { Source } from "@/db/schema";
import type { CaptionTrack } from "@/types/domain";

/** Only the fields offeredTracks reads; the rest of a Source is irrelevant here. */
function youtube(metadata: { captionTracks?: CaptionTrack[]; captionLanguage?: string }): Source {
  return { type: "YOUTUBE", metadata } as unknown as Source;
}

const DEVANAGARI = "सो लेट्स स्टार्ट विद द वीडियो एंड अंडरस्टैंड दैट एआई गेटवे";
const ENGLISH = "So let us start with the video and understand the AI gateway";

describe("offeredTracks", () => {
  it("never offers the same code twice", () => {
    // The case that broke React: no recorded caption tracks, and the indexed
    // text is itself the translation. One synthetic entry and one derived
    // entry were both called en-x-mt, so the switch rendered a duplicate key
    // and would have shown the same language twice.
    const source = youtube({ captionLanguage: TRANSLATED_ENGLISH });
    const codes = offeredTracks(source, ENGLISH).map((track) => track.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("marks the translation as the current track once it is what was indexed", () => {
    const source = youtube({
      captionTracks: [{ code: "hi", label: "Hindi (auto-generated)" }],
      captionLanguage: TRANSLATED_ENGLISH,
    });

    const tracks = offeredTracks(source, ENGLISH);
    const codes = tracks.map((track) => track.code);

    // The indexed track has to be present or the switch has nothing to mark,
    // and the captions endpoint rejects a request for a track it did not offer.
    expect(indexedTrack(source)).toBe(TRANSLATED_ENGLISH);
    expect(codes).toContain(TRANSLATED_ENGLISH);
    expect(codes).toContain("hi");
    // Still offered: the Hindi track is downloadable, so it can be romanised.
    expect(codes).toContain(HINGLISH);
  });

  it("offers Hinglish and a translation for a Devanagari transcript", () => {
    const source = youtube({ captionTracks: [{ code: "hi", label: "Hindi" }] });
    const tracks = offeredTracks(source, DEVANAGARI);

    expect(tracks.map((track) => track.code)).toEqual(["hi", HINGLISH, TRANSLATED_ENGLISH]);
    expect(tracks.find((track) => track.code === HINGLISH)?.kind).toBe("romanized");
    expect(tracks.find((track) => track.code === TRANSLATED_ENGLISH)?.kind).toBe("translated");
  });

  it("reads the script off the text when no tracks were recorded", () => {
    // Every source ingested before caption tracks were stored has an empty
    // metadata object, and requiring that list meant the switch never appeared
    // for any of them.
    const codes = offeredTracks(youtube({}), DEVANAGARI).map((track) => track.code);

    expect(codes).toContain(HINGLISH);
    expect(codes).toContain(TRANSLATED_ENGLISH);
  });

  it("offers nothing extra for an English video", () => {
    const source = youtube({ captionTracks: [{ code: "en", label: "English" }] });

    // Nothing to romanise and nothing to translate, so there is nothing to
    // switch between and the control should not appear at all.
    expect(offeredTracks(source, ENGLISH).map((track) => track.code)).toEqual(["en"]);
  });

  it("ignores a source that is not a video", () => {
    expect(offeredTracks({ type: "PDF", metadata: {} } as unknown as Source, "")).toEqual([]);
  });
});
