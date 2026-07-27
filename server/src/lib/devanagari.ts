/**
 * Devanagari to Latin, for the Hinglish caption track.
 *
 * "Hinglish" here means Hindi written in Latin script, which is how most
 * people who speak Hindi actually type it. It is not a translation: the words
 * and the word order are unchanged, only the script differs. Someone who
 * understands spoken Hindi but does not read Devanagari can follow the
 * transcript, and that is a large fraction of the audience for a Hindi video.
 *
 * This is done here rather than by a model because it is a mapping, not a
 * judgement: it is deterministic, instant, free, and it cannot hallucinate a
 * sentence that was never spoken. A model translating a thousand cues would be
 * slower, cost money per view, and occasionally invent.
 *
 * The one genuinely hard part is schwa deletion, handled below.
 */

/** Independent vowels, which carry their sound without a consonant. */
const VOWELS: Record<string, string> = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "ee",
  उ: "u",
  ऊ: "oo",
  ऋ: "ri",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  ऑ: "o",
  ऍ: "e",
};

/** Vowel signs, which replace a consonant's inherent "a". */
const MATRAS: Record<string, string> = {
  "ा": "aa",
  "ि": "i",
  "ी": "ee",
  "ु": "u",
  "ू": "oo",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ॉ": "o",
  "ॅ": "e",
};

/**
 * Consonants, each of which carries an inherent "a" unless a matra or a virama
 * says otherwise. The retroflex and dental rows collapse to the same Latin
 * letters, because Hinglish as people write it does not distinguish them.
 */
const CONSONANTS: Record<string, string> = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "n",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "n",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  ळ: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
  // Precomposed nukta forms, mostly for loanwords from Persian, Arabic and
  // English. The decomposed forms are handled by NUKTA below.
  क़: "q",
  ख़: "kh",
  ग़: "g",
  ज़: "z",
  ड़: "r",
  ढ़: "rh",
  फ़: "f",
  य़: "y",
};

/** What a nukta does to the consonant before it, when written separately. */
const NUKTA: Record<string, string> = {
  क: "q",
  ख: "kh",
  ग: "g",
  ज: "z",
  ड: "r",
  ढ: "rh",
  फ: "f",
};

const DIGITS: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

const VIRAMA = "्";
const NUKTA_SIGN = "़";
const ANUSVARA = "ं";
const CHANDRABINDU = "ँ";
const VISARGA = "ः";

/** An anusvara is "m" before a labial and "n" everywhere else. */
const LABIALS = new Set(["प", "फ", "ब", "भ", "म"]);

/**
 * One unit of the word. A consonant records whether its "a" is inherent,
 * because only an inherent one is a candidate for deletion; an "a" that was
 * written as a matra is always pronounced.
 */
type Unit =
  | { kind: "consonant"; latin: string; vowel: string; inherent: boolean; tail: string }
  | { kind: "vowel"; latin: string; tail: string }
  | { kind: "literal"; latin: string };

function isDevanagari(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code >= 0x0900 && code <= 0x097f;
}

/** The trailing signs that attach to a syllable rather than start a new one. */
function readTail(text: string, at: number): { tail: string; next: number } {
  let tail = "";
  let index = at;

  for (;;) {
    const character = text[index];
    if (character === ANUSVARA || character === CHANDRABINDU) {
      const following = text[index + 1] ?? "";
      tail += LABIALS.has(following) ? "m" : "n";
    } else if (character === VISARGA) {
      tail += "h";
    } else {
      break;
    }
    index += 1;
  }

  return { tail, next: index };
}

function toUnits(word: string): Unit[] {
  const units: Unit[] = [];
  let index = 0;

  while (index < word.length) {
    const character = word[index] ?? "";

    const consonant = CONSONANTS[character];
    if (consonant) {
      index += 1;

      let latin = consonant;
      if (word[index] === NUKTA_SIGN) {
        latin = NUKTA[character] ?? latin;
        index += 1;
      }

      let vowel = "a";
      let inherent = true;

      if (word[index] === VIRAMA) {
        vowel = "";
        inherent = false;
        index += 1;
      } else {
        const matra = MATRAS[word[index] ?? ""];
        if (matra !== undefined) {
          vowel = matra;
          inherent = false;
          index += 1;
        }
      }

      const { tail, next } = readTail(word, index);
      index = next;

      units.push({ kind: "consonant", latin, vowel, inherent, tail });
      continue;
    }

    const vowel = VOWELS[character];
    if (vowel) {
      index += 1;
      const { tail, next } = readTail(word, index);
      index = next;
      units.push({ kind: "vowel", latin: vowel, tail });
      continue;
    }

    const digit = DIGITS[character];
    if (digit) {
      index += 1;
      units.push({ kind: "literal", latin: digit });
      continue;
    }

    index += 1;
    if (character === "ॐ") units.push({ kind: "literal", latin: "om" });
    else if (character === "।" || character === "॥") units.push({ kind: "literal", latin: "." });
    else if (character === "ऽ") continue;
    else if (!isDevanagari(character)) units.push({ kind: "literal", latin: character });
  }

  return units;
}

/**
 * Drops the inherent "a" where Hindi does not pronounce it.
 *
 * Devanagari writes every consonant as carrying an "a", and Hindi then does
 * not say most of them. Transliterating literally gives "kamala" for कमल and
 * "bharata" for भारत, which reads as Sanskrit and is exactly the thing that
 * makes machine romanisation look wrong at a glance.
 *
 * Two rules, applied in this order, get almost all of it:
 *
 *   1. The final "a" of a word is silent. कमल is "kamal".
 *   2. Scanning right to left, an "a" between two consonants is silent, unless
 *      the syllable after it just lost its own "a". नमकीन is "namkeen": the
 *      "a" of म goes because क keeps its "ee". The "a" of म in कमल stays,
 *      because ल already lost one and dropping both would leave "kaml".
 *
 * Rule 2 is the standard heuristic rather than a complete account of Hindi
 * phonology. It is wrong occasionally, always in the direction of an extra
 * vowel, which stays readable.
 */
function deleteSchwas(units: Unit[]): Unit[] {
  const result = units.map((unit) => ({ ...unit }));

  // Syllables, not consonants. Counting consonants put आपको one place out and
  // produced "aapako", because प is the second syllable of the word but the
  // first consonant, and it left इस as "isa", because a word can be two
  // syllables while holding only one consonant.
  const syllables = result.filter((unit) => unit.kind !== "literal");
  if (syllables.length < 2) return result;

  const deleted = new Set<number>();
  const last = syllables[syllables.length - 1];

  if (last && last.kind === "consonant" && last.inherent) {
    last.vowel = "";
    deleted.add(syllables.length - 1);
  }

  // Right to left, because whether this syllable keeps its "a" depends on what
  // happened to the one after it.
  for (let index = syllables.length - 2; index >= 1; index -= 1) {
    const unit = syllables[index];
    if (!unit || unit.kind !== "consonant" || !unit.inherent) continue;
    if (deleted.has(index + 1)) continue;

    unit.vowel = "";
    deleted.add(index);
  }

  return result;
}

function render(units: Unit[]): string {
  return units
    .map((unit) => {
      if (unit.kind === "literal") return unit.latin;
      if (unit.kind === "vowel") return unit.latin + unit.tail;
      return unit.latin + unit.vowel + unit.tail;
    })
    .join("");
}

/**
 * Transliterates a line, leaving anything that is not Devanagari alone.
 *
 * Hindi captions are full of English: product names, technical terms, whole
 * clauses. Those arrive already in Latin script and must survive untouched,
 * which is why the split is on script rather than on the whole string.
 */
export function toLatin(text: string): string {
  return text.replace(/[ऀ-ॿ]+/g, (run) => render(deleteSchwas(toUnits(run))));
}

/** Whether a line contains enough Devanagari to be worth transliterating. */
export function hasDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}
