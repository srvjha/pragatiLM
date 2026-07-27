import Link from "next/link";
import {
  ArrowRight,
  Captions,
  FileText,
  FileVideo,
  Globe,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TetherDemo } from "@/components/marketing/tether-demo";
import { Reveal } from "@/components/marketing/reveal";

/**
 * The landing page.
 *
 * Its one job is to make the product's central claim credible: that an answer
 * here is traceable, and that when the sources cannot support one you get told
 * so. The hero shows a citation tied to the page it came from, and the section
 * below it shows the refusal, because those two behaviours are the product.
 *
 * Every band is separated by a seam rather than a full-width rule, and arrives
 * on scroll rather than sitting there. Both are quiet on purpose: this page is
 * selling carefulness, and a page that shouts undercuts the claim.
 */
export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <Refusal />
        <Pipeline />
        <Sources />
        <Generators />
        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * The small mono label above a heading.
 *
 * It carried a marker dot, which was the palette's own rule being broken in
 * the most visible place on the site: yellow is reserved for a span the
 * product actually matched, and an eyebrow has matched nothing. Letterspacing
 * does the work instead.
 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.16em] uppercase">
      {children}
    </p>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ruled paper, fading out before it reaches the content below it. */}
      <div
        className="ruled pointer-events-none absolute inset-x-0 top-0 h-[38rem] opacity-[0.55] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-24 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal className="flex justify-center">
            <Eyebrow>Retrieval you can check</Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            {/* Plain. The marker slab under "See where" sat across the
                descenders and read as a redaction bar rather than a
                highlight, and the headline is emphatic enough at this size
                without anything drawn behind it. */}
            <h1 className="mt-6 text-4xl leading-[1.03] font-semibold text-balance sm:text-6xl">
              Ask your documents. See where every answer came from.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl font-serif text-lg leading-relaxed text-pretty">
              Add your PDFs, lectures, transcripts and links. Every sentence of
              every answer carries a marker that opens the exact page, paragraph
              or second it came from. When the answer is not in your sources,
              you get told that instead of a guess.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="xl"
                nativeButton={false}
                render={
                  <Link href="/sign-up">
                    Start a notebook
                    <ArrowRight className="transition-transform duration-200 group-hover/button:translate-x-0.5" />
                  </Link>
                }
              />
              <Button
                variant="outline"
                size="xl"
                nativeButton={false}
                render={<Link href="#how">See what happens when you ask</Link>}
              />
            </div>

            <p className="text-muted-foreground mt-5 font-mono text-xs">
              Email, Google or GitHub · Your notebooks are private to you
            </p>
          </Reveal>
        </div>

        <Reveal delay={240} className="mt-16">
          <TetherDemo />
        </Reveal>
      </div>
    </section>
  );
}

function Refusal() {
  return (
    <section id="refusal" className="seam">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <Eyebrow>The part most tools skip</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold text-balance sm:text-4xl">
            It would rather say no.
          </h2>
          <div className="text-muted-foreground mt-6 space-y-4 font-serif text-base leading-relaxed">
            <p>
              Before a single word is written, the passages that came back are
              scored out of ten on whether they can actually answer the
              question, and asked what is missing.
            </p>
            <p>
              Below the line, those gaps become new search terms and the search
              runs again, up to three rounds. The best round is what reaches the
              model, not the last one.
            </p>
            <p>
              If no round clears the bar, you get the sentence beside this one.
              The strongest guard against a confident wrong answer is never
              asking for one.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <figure className="bg-card rounded-xl border p-6 shadow-sm sm:p-8">
            <figcaption className="text-muted-foreground mb-5 font-mono text-[0.68rem] tracking-[0.12em] uppercase">
              Asked about something not in the notebook
            </figcaption>

            <p className="border-stamp/40 text-stamp border-l-2 py-1 pl-5 font-serif text-[1.05rem] leading-relaxed">
              I could not find this in your sources.
            </p>

            <p className="text-muted-foreground mt-6 border-t pt-5 text-sm leading-relaxed">
              With the option to widen the search across every source, rather
              than a dead end.
            </p>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

function Pipeline() {
  return (
    <section id="how" className="seam">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal className="max-w-2xl">
          <Eyebrow>Seven steps</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold text-balance sm:text-4xl">
            What happens when you ask.
          </h2>
          <p className="text-muted-foreground mt-5 font-serif text-base leading-relaxed">
            One vector lookup on your raw question is not good enough, and it
            fails in two places: the question is often a poor search key, and
            whatever comes back is normally accepted without anyone asking
            whether it is enough. Each step is switchable, so every stage has to
            earn its latency.
          </p>
        </Reveal>

        <ol className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <Reveal
              as="li"
              key={step.title}
              delay={(index % 3) * 70}
              className="group border-t pt-5"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-muted-foreground group-hover:text-foreground font-mono text-xs tabular-nums transition-colors">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
              </div>
              <p className="text-muted-foreground mt-2 font-serif text-sm leading-relaxed">
                {step.body}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Sources() {
  return (
    <section id="sources" className="seam">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal className="max-w-2xl">
          <Eyebrow>Five kinds of source</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold text-balance sm:text-4xl">
            Five kinds of source, five kinds of citation.
          </h2>
          <p className="text-muted-foreground mt-5 font-serif text-base leading-relaxed">
            A citation is only useful if it points somewhere exact, so each type
            is split along its own natural seam and carries the locator that
            suits it.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source, index) => (
            <Reveal key={source.title} delay={(index % 3) * 70}>
              <article className="bg-card hover:border-foreground/20 group flex h-full flex-col rounded-xl border p-6 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <source.icon
                  className="text-muted-foreground group-hover:text-foreground size-5 transition-colors"
                  strokeWidth={1.5}
                />
                <h3 className="mt-4 font-semibold">{source.title}</h3>
                <p className="text-muted-foreground mt-2 flex-1 font-serif text-sm leading-relaxed">
                  {source.body}
                </p>
                <p className="text-muted-foreground mt-5 border-t pt-4 font-mono text-[0.7rem]">
                  {source.locator}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={140}>
          <p className="text-muted-foreground mt-10 max-w-2xl font-serif text-sm leading-relaxed">
            Web pages are captured when you add them, so the viewer still shows
            what the model read even if the site later goes down or blocks
            embedding.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Generators() {
  return (
    <section className="seam">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2">
        {generators.map((item, index) => (
          <Reveal key={item.title} delay={index * 90}>
            <Eyebrow>{item.eyebrow}</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold">{item.title}</h2>
            <p className="text-muted-foreground mt-3 font-serif text-base leading-relaxed">
              {item.body}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/**
 * The close.
 *
 * Set on ink rather than paper, because it is the only block on the page
 * asking for something and it should not read as another section of prose.
 */
function ClosingCta() {
  return (
    <section className="seam">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="bg-foreground text-background relative overflow-hidden rounded-2xl px-8 py-16 text-center sm:px-16 sm:py-20">
            <div
              className="ruled pointer-events-none absolute inset-0 opacity-[0.06]"
              aria-hidden
            />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold text-balance sm:text-4xl">
                Your sources. Your questions. Nothing invented in between.
              </h2>

              <p className="text-background/70 mx-auto mt-5 max-w-xl font-serif text-base leading-relaxed">
                Add a PDF or paste a link, ask one question, and click the
                marker on the answer. That is the whole product in about a
                minute.
              </p>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="xl"
                  nativeButton={false}
                  className="bg-background text-foreground hover:bg-background/85"
                  render={
                    <Link href="/sign-up">
                      Start a notebook
                      <ArrowRight className="transition-transform duration-200 group-hover/button:translate-x-0.5" />
                    </Link>
                  }
                />
                <Button
                  variant="ghost"
                  size="xl"
                  nativeButton={false}
                  className="text-background hover:bg-background/10 hover:text-background"
                  render={
                    <Link href="/sign-in">I already have an account</Link>
                  }
                />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
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
    body: "Captions pulled per cue and merged into passages of roughly a minute of speech, with the video playable beside them.",
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

const generators = [
  {
    eyebrow: "Roadmap",
    title: "A roadmap through the material",
    body: "Ordered modules built from what your videos and transcripts actually teach. Each one is pinned to the timestamps where the concept is covered, and a concept with no pin does not make the list, so the roadmap cannot invent topics your sources never mention. Tell it whether you are new to the subject and it changes the granularity.",
  },
  {
    eyebrow: "Podcast",
    title: "A podcast from your notebook",
    body: "Two hosts, three to ten minutes, written only from summaries of the sources you picked and told to introduce nothing else. The script sits beside the player with each turn linked to the sources behind it, so you can check what was said rather than take it on trust.",
  },
];
