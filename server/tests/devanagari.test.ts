import { describe, expect, it } from "vitest";
import { hasDevanagari, toLatin } from "@/lib/devanagari";

describe("toLatin", () => {
  it("drops the silent final a", () => {
    // Written with three inherent vowels, said with two. A literal
    // transliteration gives "kamala", which is the thing that makes machine
    // romanisation look wrong at a glance.
    expect(toLatin("कमल")).toBe("kamal");
    expect(toLatin("भारत")).toBe("bhaarat");
  });

  it("keeps the a a second deletion would swallow", () => {
    // Both middle and final syllables are candidates. Taking both leaves
    // "samjh", which cannot be said.
    expect(toLatin("समझ")).toBe("samajh");
  });

  it("drops a medial a when the syllable after it keeps its own vowel", () => {
    expect(toLatin("नमकीन")).toBe("namkeen");
  });

  it("counts syllables rather than consonants", () => {
    // आपको is three syllables and two consonants. Counting consonants made the
    // first one look word-initial and produced "aapako"; इस is two syllables
    // and one consonant, and came out as "isa".
    expect(toLatin("आपको")).toBe("aapko");
    expect(toLatin("इस")).toBe("is");
    expect(toLatin("एक")).toBe("ek");
  });

  it("keeps a single syllable intact", () => {
    // Nothing to delete: "na" is the whole word.
    expect(toLatin("न")).toBe("na");
    expect(toLatin("है")).toBe("hai");
  });

  it("reads an anusvara as m before a labial and n elsewhere", () => {
    expect(toLatin("अंबर")).toBe("ambar");
    expect(toLatin("हिंदी")).toBe("hindee");
  });

  it("handles conjuncts and nukta consonants", () => {
    expect(toLatin("स्कूल")).toBe("skool");
    expect(toLatin("क्या")).toBe("kyaa");
    expect(toLatin("ज़रूरी")).toBe("zarooree");
  });

  it("leaves English alone", () => {
    // Hindi captions are full of English, and it arrives already in Latin
    // script. Transliterating the whole string rather than the Devanagari runs
    // inside it would mangle every technical term in the transcript.
    expect(toLatin("इस video में machine learning")).toBe("is video men machine learning");
    expect(toLatin("Hello world")).toBe("Hello world");
  });

  it("romanises a whole spoken sentence", () => {
    expect(toLatin("कैसे हो")).toBe("kaise ho");
    expect(toLatin("मैं आपको बताता हूं")).toBe("main aapko bataataa hoon");
  });
});

describe("hasDevanagari", () => {
  it("separates a Devanagari line from a Latin one", () => {
    expect(hasDevanagari("यह हिंदी है")).toBe(true);
    expect(hasDevanagari("this is English")).toBe(false);
    // Mixed counts: the line still needs romanising.
    expect(hasDevanagari("यह video है")).toBe(true);
  });
});
