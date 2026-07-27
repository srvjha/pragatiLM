"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Captions,
  FileText,
  FileVideo,
  Globe,
  RefreshCw,
  Type,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { StatTile, StatTileSkeleton } from "@/components/dashboard/stat-tile";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AnalyticsDto } from "@/types/api";

const sourceIcon: Record<string, typeof FileText> = {
  PDF: FileText,
  TEXT: Type,
  WEB: Globe,
  YOUTUBE: FileVideo,
  VTT: Captions,
};

/**
 * One grid definition for every band of tiles on the page. Sections with three
 * or two figures leave the last columns empty rather than stretching to fill
 * them, so a tile is the same width wherever it appears and the eye can read
 * straight down the page through all of them.
 */
const TILE_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

/**
 * The analytics page.
 *
 * The figures are grouped by the question they answer rather than dumped into
 * one grid, because the groups are not equally interesting. What is in the
 * account is inventory. How the answers came out is the part worth acting on:
 * a climbing refusal rate means the corpus does not cover the questions being
 * asked, and a median correction round above zero is a defect in chunking or
 * retrieval rather than the loop working as intended.
 */
export default function DashboardPage() {
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiFetch<AnalyticsDto>("/analytics"),
  });

  /**
   * A brand new account has zeros in every field, which is a true reading of
   * an empty corpus but looks identical to a broken page. It gets prose and a
   * way to start instead.
   */
  const untouched =
    data !== undefined &&
    data.notebooks === 0 &&
    data.sources.total === 0 &&
    data.answers.questions === 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-9">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="text-muted-foreground -ml-2.5 mb-4"
            render={
              <Link href="/app">
                <ArrowLeft />
                Notebooks
              </Link>
            }
          />

          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-muted-foreground mt-2 max-w-xl font-serif text-sm leading-relaxed">
                What is in your account, and how well it is answering from it.
                Every figure here is counted from your own notebooks — nothing
                is estimated.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="text-muted-foreground shrink-0"
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  // Rotation is a transform, so it composites; anyone who has
                  // asked for less motion just gets a disabled button.
                  isFetching && "animate-spin motion-reduce:animate-none",
                )}
              />
              Refresh
            </Button>
          </div>
        </header>

        {isPending && <LoadingBoard />}

        {isError && (
          <p className="border-stamp/30 bg-stamp/5 text-stamp rounded-xl border px-4 py-3 text-sm">
            Could not load your figures. Reload to try again.
          </p>
        )}

        {data && untouched && <FirstRun />}

        {data && !untouched && (
          <div className="space-y-10">
            <Section id="library" title="Your library">
              <dl className={TILE_GRID}>
                <StatTile
                  label="Notebooks"
                  value={count(data.notebooks)}
                  note="Each one answers only from the sources inside it."
                />
                <StatTile
                  label="Sources"
                  value={count(data.sources.total)}
                  detail={
                    <>
                      {count(data.sources.ready)} ready
                      {data.sources.failed > 0 && (
                        // The failure count is the one thing in this tile that
                        // asks for action, so it is the only thing coloured.
                        <span className="text-stamp">
                          {" · "}
                          {count(data.sources.failed)} failed
                        </span>
                      )}
                    </>
                  }
                  note="Only a ready source can be quoted in an answer."
                />
                <StatTile
                  label="Passages indexed"
                  value={count(data.index.chunks)}
                  note="Retrieval searches these, not whole documents."
                />
                <StatTile
                  label="Tokens indexed"
                  value={compact(data.index.tokens)}
                  detail={`${bytes(data.index.storedBytes)} stored`}
                  note="Roughly how much of your text is searchable."
                />
              </dl>

              {data.sources.byType.length > 0 && (
                <ByType rows={data.sources.byType} />
              )}
            </Section>

            <Section
              id="answers"
              title="How answers were produced"
              blurb="The numbers worth acting on."
            >
              {data.answers.questions === 0 ? (
                <Waiting>
                  No questions asked yet. Ask one in{" "}
                  <TextLink href="/app">a notebook</TextLink> and citation
                  coverage, refusals and correction rounds appear here.
                </Waiting>
              ) : (
                <dl className={TILE_GRID}>
                  <StatTile
                    label="Questions asked"
                    value={count(data.answers.questions)}
                    detail={`${count(data.answers.answered)} answered · ${count(data.answers.refused)} refused`}
                    note="Everything put to a notebook, answered or not."
                  />
                  <StatTile
                    label="Answers with a citation"
                    value={percent(data.answers.citationCoverage)}
                    detail={`${count(data.answers.withCitations)} of ${count(data.answers.answered)} answered`}
                    meter={
                      data.answers.citationCoverage === null
                        ? undefined
                        : {
                            fraction: data.answers.citationCoverage,
                            tone: "marker",
                          }
                    }
                    note="An answer without one has nothing standing behind it."
                  />
                  <StatTile
                    label="Refused"
                    value={percent(data.answers.refusalRate)}
                    detail={`${count(data.answers.refused)} of ${count(data.answers.questions)} asked`}
                    meter={
                      data.answers.refusalRate === null
                        ? undefined
                        : { fraction: data.answers.refusalRate, tone: "stamp" }
                    }
                    // Refusing is the product working correctly, so a low rate
                    // is not a fault and is not stamped. The figure only turns
                    // red once a quarter of questions are going unanswered,
                    // which is the point it stops being healthy caution and
                    // starts being a gap in the corpus.
                    tone={
                      (data.answers.refusalRate ?? 0) >= 0.25
                        ? "stamp"
                        : "neutral"
                    }
                    note="Rising means your sources do not cover what is asked."
                  />
                  <StatTile
                    label="Median correction rounds"
                    value={fixed(data.retrieval.medianCorrectionRounds, 1)}
                    detail={`over ${count(data.retrieval.runs)} retrieval runs`}
                    note={
                      data.retrieval.medianCorrectionRounds > 0
                        ? "Above zero points at chunking or retrieval."
                        : "Questions are answered on the first pass."
                    }
                  />
                </dl>
              )}
            </Section>

            <Section
              id="retrieval"
              title="Speed"
              blurb="What happens between the question and the answer."
            >
              {data.retrieval.runs === 0 ? (
                <Waiting>
                  Nothing has been retrieved yet. Timings appear after the first
                  question is asked.
                </Waiting>
              ) : (
                <dl className={TILE_GRID}>
                  <StatTile
                    label="Retrieval runs"
                    value={count(data.retrieval.runs)}
                    note="One question can search more than once."
                  />
                  <StatTile
                    label="Median retrieval time"
                    value={count(data.retrieval.medianLatencyMs)}
                    unit="ms"
                    note="Half of searches finished faster than this."
                  />
                  <StatTile
                    label="Average context grade"
                    value={fixed(data.retrieval.averageContextGrade, 1)}
                    unit="/ 10"
                    note="How well the passages fetched matched the question."
                  />
                </dl>
              )}
            </Section>

            <Section
              id="activity"
              title="Last 14 days"
              blurb="Questions asked against sources added."
            >
              <Activity activity={data.activity} />
            </Section>

            <Section id="generated" title="Generated">
              {data.artifacts.roadmaps + data.artifacts.podcasts === 0 ? (
                <Waiting>
                  No roadmaps or episodes yet. Both are written from a
                  notebook&rsquo;s own sources, so they need sources first.
                </Waiting>
              ) : (
                <dl className={TILE_GRID}>
                  <StatTile
                    label="Roadmaps"
                    value={count(data.artifacts.roadmaps)}
                    note="Study plans built from a notebook."
                  />
                  <StatTile
                    label="Podcast episodes"
                    value={count(data.artifacts.podcasts)}
                    note="Two-host scripts, written from your sources."
                  />
                </dl>
              )}
            </Section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
        <h2 id={`${id}-heading`} className="text-sm font-semibold">
          {title}
        </h2>
        {blurb && (
          <p className="text-muted-foreground font-serif text-xs">{blurb}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Stands in for a band of tiles that has nothing to show. The dashed edge is
 * doing the work: it says the space is reserved rather than filled, which a
 * row of hard zeros does not.
 */
function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-7 text-center font-serif text-sm leading-relaxed">
      <p className="mx-auto max-w-md">{children}</p>
    </div>
  );
}

function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary"
    >
      {children}
    </Link>
  );
}

/**
 * The first-run screen. An account with nothing in it would otherwise render a
 * page of zeros, which reads as a failure rather than as a beginning, so the
 * zeros are replaced by what the page will eventually say and one way to get
 * there.
 */
function FirstRun() {
  return (
    <div className="bg-card rounded-xl border px-6 py-16 text-center">
      <h2 className="text-lg font-semibold">Nothing to measure yet</h2>
      <p className="text-muted-foreground mx-auto mt-3 max-w-md font-serif text-sm leading-relaxed">
        This page counts what you have collected and grades how the answers came
        out: how many carried a citation, how many were refused for want of a
        source, how long retrieval took. Add a source, ask one question, and the
        figures start here.
      </p>
      <Button
        className="mt-7"
        nativeButton={false}
        render={
          <Link href="/app">
            Create your first notebook
            <ArrowRight className="transition-transform duration-200 group-hover/button:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        }
      />
    </div>
  );
}

/**
 * Skeletons for the real headings and the real tile geometry, rather than a
 * generic block. The headings are known before the request returns, so they
 * are printed rather than greyed, and nothing on the page moves when the
 * figures land.
 */
function LoadingBoard() {
  return (
    <div className="space-y-10" aria-busy>
      {[
        { id: "library", title: "Your library", tiles: 4 },
        { id: "answers", title: "How answers were produced", tiles: 4 },
        { id: "retrieval", title: "Speed", tiles: 3 },
      ].map((section) => (
        <Section key={section.id} id={section.id} title={section.title}>
          <div className={TILE_GRID}>
            {Array.from({ length: section.tiles }, (_value, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </div>
        </Section>
      ))}
      <Section id="activity" title="Last 14 days">
        <div className="bg-card animate-pulse rounded-xl border p-4 motion-reduce:animate-none">
          <div className="h-36" />
        </div>
      </Section>
    </div>
  );
}

/**
 * The breakdown of the sources tile above it. It is deliberately not built out
 * of tiles: these are parts of a number already shown, and giving them the
 * same weight would make five formats look as important as the whole library.
 */
function ByType({ rows }: { rows: AnalyticsDto["sources"]["byType"] }) {
  return (
    <div className="bg-card mt-3 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.12em] uppercase">
        By type
      </p>
      <ul className="mt-2.5 flex flex-wrap items-center gap-x-7 gap-y-2.5">
        {rows.map((row) => {
          const Icon = sourceIcon[row.type] ?? FileText;
          return (
            <li key={row.type} className="flex items-baseline gap-2">
              <Icon
                className="text-muted-foreground size-3.5 shrink-0 translate-y-0.5"
                strokeWidth={1.5}
              />
              <span className="tabular font-mono text-sm">
                {count(row.count)}
              </span>
              <span className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.12em] uppercase">
                {row.type}
              </span>
              {row.ready < row.count && (
                <span className="text-muted-foreground tabular font-mono text-[0.65rem]">
                  ({count(row.ready)} ready)
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Two series on one baseline. Deliberately not a charting library: it is
 * fourteen pairs of bars, and shipping a dependency for that would cost more
 * to load than the whole page.
 *
 * Both series are counts of events per day, so they share one scale and one
 * baseline. A second axis would let two unrelated slopes be read as if they
 * tracked each other, which is exactly the comparison this chart must not
 * invite.
 */
function Activity({ activity }: { activity: AnalyticsDto["activity"] }) {
  const days = activity ?? [];

  const questions = days.reduce((total, day) => total + day.questions, 0);
  const sources = days.reduce((total, day) => total + day.sources, 0);
  const peak = Math.max(
    1,
    ...days.map((day) => Math.max(day.sources, day.questions)),
  );

  if (days.length === 0 || questions + sources === 0) {
    return (
      <Waiting>
        Nothing added or asked in the last fourteen days. This fills in as you
        use your notebooks.
      </Waiting>
    );
  }

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="text-muted-foreground mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <p className="font-serif">
          <span className="tabular text-foreground font-mono">
            {count(questions)}
          </span>{" "}
          questions and{" "}
          <span className="tabular text-foreground font-mono">
            {count(sources)}
          </span>{" "}
          sources added
        </p>
        <p className="tabular font-mono text-[0.65rem] tracking-[0.12em] uppercase">
          Peak {count(peak)} / day
        </p>
      </div>

      {/* The column needs its own resolved height, otherwise the bars inside
          size against `auto` and collapse to nothing. The bottom border is the
          baseline both series grow from. */}
      <div className="flex h-36 items-stretch gap-1 border-b" aria-hidden>
        {days.map((day) => (
          <div
            key={day.day}
            className="hover:bg-accent/40 flex h-full flex-1 flex-col rounded-t-sm"
          >
            <div className="flex min-h-0 flex-1 items-end justify-center gap-0.5 px-0.5">
              {/* A day with any activity keeps a visible sliver, so "one" and
                  "none" never render as the same empty column. */}
              <div
                className="bg-chart-1 w-1/2 rounded-t-sm"
                style={{
                  height: `${Math.max(day.questions ? 3 : 0, (day.questions / peak) * 100)}%`,
                }}
                title={`${day.questions} questions on ${day.day}`}
              />
              <div
                className="bg-chart-2 w-1/2 rounded-t-sm"
                style={{
                  height: `${Math.max(day.sources ? 3 : 0, (day.sources / peak) * 100)}%`,
                }}
                title={`${day.sources} sources added on ${day.day}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1" aria-hidden>
        {days.map((day) => (
          <span
            key={day.day}
            className="text-muted-foreground tabular flex-1 text-center font-mono text-[0.6rem]"
          >
            {day.day.slice(8)}
          </span>
        ))}
      </div>

      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-1 size-2 rounded-xs" /> Questions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-2 size-2 rounded-xs" /> Sources added
        </span>
      </div>

      {/* The bars are hidden from assistive technology because a stack of
          percentage-height divs says nothing; this is the same data as a
          readable list. */}
      <ul className="sr-only">
        {days.map((day) => (
          <li key={day.day}>
            {day.day}: {day.questions} questions, {day.sources} sources added
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nothing on this page may render NaN or a zero that was really an absence. */
const missing = (value: number | null | undefined): boolean =>
  value === null || value === undefined || Number.isNaN(value);

const EM_DASH = "—";

const counter = new Intl.NumberFormat("en-US");

const count = (value: number | null | undefined) =>
  missing(value) ? EM_DASH : counter.format(value as number);

const fixed = (value: number | null | undefined, digits: number) =>
  missing(value) ? EM_DASH : (value as number).toFixed(digits);

const compact = (value: number | null | undefined) => {
  if (missing(value)) return EM_DASH;
  const number = value as number;
  return number >= 1_000_000
    ? `${(number / 1_000_000).toFixed(1)}M`
    : number >= 1_000
      ? `${(number / 1_000).toFixed(1)}k`
      : counter.format(number);
};

const bytes = (value: number | null | undefined) => {
  if (missing(value)) return EM_DASH;
  const number = value as number;
  return number >= 1_048_576
    ? `${(number / 1_048_576).toFixed(1)} MB`
    : number >= 1024
      ? `${Math.round(number / 1024)} KB`
      : `${number} B`;
};

const percent = (value: number | null | undefined) =>
  missing(value) ? EM_DASH : `${Math.round((value as number) * 100)}%`;
