import Link from "next/link";
import { Captions, FileText, FileVideo, Globe, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { SiteHeader } from "@/components/marketing/site-header";
import { TetherDemo } from "@/components/marketing/tether-demo";

/**
 * The landing page.
 *
 * Its one job is to make the product's central claim credible: that an answer
 * here is traceable, and that when the sources cannot support one you get told
 * so. The hero shows a citation tied to the page it came from, and the section
 * below it shows the refusal, because those two behaviours are the product.
 */
export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-10 pb-20 sm:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-muted-foreground mb-5 font-mono text-xs tracking-widest uppercase">
              Retrieval you can check
            </p>
            <h1 className="text-4xl leading-[1.05] font-semibold text-balance sm:text-6xl">
              Ask your documents. See where every answer came from.
            </h1>
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl font-serif text-lg leading-relaxed text-pretty">
              Add your PDFs, lectures, transcripts and links. Every sentence of
              every answer carries a marker that opens the exact page, paragraph
              or second it came from. When the answer is not in your sources,
              you get told that instead of a guess.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href="/sign-up">Start a notebook</Link>}
              />
              <Button
                variant="outline"
                size="lg"
                nativeButton={false}
                render={<Link href="#how">See what happens when you ask</Link>}
              />
            </div>
          </div>

          <div className="mt-16">
            <TetherDemo />
          </div>
        </section>

        {/* The refusal, which is the other half of the promise. */}
        <section className="border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-muted-foreground mb-4 font-mono text-xs tracking-widest uppercase">
                The part most tools skip
              </p>
              <h2 className="text-3xl font-semibold text-balance sm:text-4xl">
                It would rather say no.
              </h2>
              <div className="text-muted-foreground mt-5 space-y-4 font-serif text-base leading-relaxed">
                <p>
                  Before a single word is written, the passages that came back
                  are scored out of ten on whether they can actually answer the
                  question, and asked what is missing.
                </p>
                <p>
                  Below the line, those gaps become new search terms and the
                  search runs again, up to three rounds. The best round is what
                  reaches the model, not the last one.
                </p>
                <p>
                  If no round clears the bar, you get the sentence below. The
                  strongest guard against a confident wrong answer is never
                  asking for one.
                </p>
              </div>
            </div>

            <figure className="bg-card rounded-lg border p-6 shadow-sm">
              <figcaption className="text-muted-foreground mb-4 font-mono text-[0.7rem] tracking-wide uppercase">
                Asked about something not in the notebook
              </figcaption>
              <p className="border-stamp/40 text-stamp border-l-2 py-1 pl-4 font-serif text-[0.95rem] leading-relaxed">
                I could not find this in your sources.
              </p>
              <p className="text-muted-foreground mt-4 text-sm">
                With the option to widen the search across every source, rather
                than a dead end.
              </p>
            </figure>
          </div>
        </section>

        {/* The pipeline. Numbered because it genuinely is a sequence. */}
        <section id="how" className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold text-balance sm:text-4xl">
                What happens when you ask.
              </h2>
              <p className="text-muted-foreground mt-4 font-serif text-base leading-relaxed">
                One vector lookup on your raw question is not good enough, and
                it fails in two places: the question is often a poor search key,
                and whatever comes back is normally accepted without anyone
                asking whether it is enough. Seven steps, each one switchable,
                so every stage has to earn its latency.
              </p>
            </div>

            <ol className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="border-t pt-4">
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground mt-1.5 font-serif text-sm leading-relaxed">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Source types. */}
        <section id="sources" className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold text-balance sm:text-4xl">
                Five kinds of source, five kinds of citation.
              </h2>
              <p className="text-muted-foreground mt-4 font-serif text-base leading-relaxed">
                A citation is only useful if it points somewhere exact, so each
                type is split along its own natural seam and carries the locator
                that suits it.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sources.map((source) => (
                <div
                  key={source.title}
                  className="bg-card rounded-lg border p-5"
                >
                  <source.icon
                    className="text-muted-foreground size-5"
                    strokeWidth={1.5}
                  />
                  <h3 className="mt-3 font-semibold">{source.title}</h3>
                  <p className="text-muted-foreground mt-1.5 font-serif text-sm leading-relaxed">
                    {source.body}
                  </p>
                  <p className="text-muted-foreground mt-3 font-mono text-[0.7rem]">
                    {source.locator}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-muted-foreground mt-8 max-w-2xl font-serif text-sm leading-relaxed">
              Web pages are captured when you add them, so the viewer still
              shows what the model read even if the site later goes down or
              blocks embedding.
            </p>
          </div>
        </section>

        {/* The two generators. */}
        <section className="border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold">
                A roadmap through the material
              </h2>
              <p className="text-muted-foreground mt-3 font-serif text-base leading-relaxed">
                Ordered modules built from what your videos and transcripts
                actually teach. Each one is pinned to the timestamps where the
                concept is covered, and a concept with no pin does not make the
                list, so the roadmap cannot invent topics your sources never
                mention. Tell it whether you are new to the subject and it
                changes the granularity.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold">
                A podcast from your notebook
              </h2>
              <p className="text-muted-foreground mt-3 font-serif text-base leading-relaxed">
                Two hosts, three to ten minutes, written only from summaries of
                the sources you picked and told to introduce nothing else. The
                script sits beside the player with each turn linked to the
                sources behind it, so you can check what was said rather than
                take it on trust.
              </p>
            </div>
          </div>
        </section>

        {/* Close. */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-24 text-center">
            <h2 className="text-3xl font-semibold text-balance sm:text-4xl">
              Your sources. Your questions. Nothing invented in between.
            </h2>
            <div className="mt-8">
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href="/sign-up">Start a notebook</Link>}
              />
            </div>
            <p className="text-muted-foreground mt-4 text-sm">
              Notebooks are private to you.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-8 text-sm">
          <Wordmark href={null} size="sm" />
          <span className="ml-auto">Answers only from what you put in.</span>
        </div>
      </footer>
    </div>
  );
}

const steps = [
  {
    title: "Translate",
    body: "Your question becomes several in one call: a standalone rewrite with references resolved, a broader step-back question, its sub-questions when it is compound, and a hypothetical answer to search as prose. Your own wording is always kept alongside them, so a bad rewrite can never discard it.",
  },
  {
    title: "Route",
    body: "Vector search for what the sources say. Keyword search when the question turns on a quoted string, an error code or a name that embeddings blur. A read-only database query for questions about the collection rather than its contents.",
  },
  {
    title: "Search",
    body: "Every variant against every routed channel, concurrently. A channel that fails returns nothing rather than failing the question, and the trace records what was lost.",
  },
  {
    title: "Fuse",
    body: "Reciprocal rank fusion across the ranked lists. A passage that surfaces across many rephrasings is more likely to be the right one than one that surfaced once, and that agreement is the reason the variants exist.",
  },
  {
    title: "Rerank",
    body: "A cross-encoder scores the survivors against your original question rather than any rewrite of it, and keeps the top eight.",
  },
  {
    title: "Grade",
    body: "A small model scores the retrieved set out of ten for whether it can answer at all, and says what is missing. Those gaps become the next search.",
  },
  {
    title: "Answer",
    body: "Numbered context blocks in, markers out, mapped back to real chunks server-side. A marker pointing at a block that was never supplied is stripped rather than shown.",
  },
];

const sources = [
  {
    icon: FileText,
    title: "PDF",
    body: "Split page by page, never across a page boundary, so a citation can name one.",
    locator: "→ page 7",
  },
  {
    icon: FileVideo,
    title: "YouTube",
    body: "Captions pulled per cue and merged into passages of roughly a minute of speech.",
    locator: "→ 04:12 – 05:03",
  },
  {
    icon: Captions,
    title: "VTT and SRT",
    body: "Your own transcripts, with speaker labels kept where the file has them.",
    locator: "→ 04:12 – 05:03",
  },
  {
    icon: Globe,
    title: "Web page",
    body: "Fetched and reduced to the article text, with the heading path kept per block.",
    locator: "→ section, characters",
  },
  {
    icon: Type,
    title: "Text",
    body: "Pasted or uploaded, with character offsets preserved exactly.",
    locator: "→ characters 1200–2100",
  },
];
