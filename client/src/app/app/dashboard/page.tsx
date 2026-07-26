"use client";

import { useQuery } from "@tanstack/react-query";
import { Captions, FileText, FileVideo, Globe, Type } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type { AnalyticsDto } from "@/types/api";

const sourceIcon: Record<string, typeof FileText> = {
  PDF: FileText,
  TEXT: Type,
  WEB: Globe,
  YOUTUBE: FileVideo,
  VTT: Captions,
};

/**
 * The analytics page.
 *
 * Two kinds of number here, kept visually apart because they mean different
 * things. The first block counts what is in the account. The second measures
 * how well retrieval is doing its job, and those are the ones worth acting on:
 * a climbing refusal rate means the corpus does not cover the questions being
 * asked, and a median correction round above zero is a defect in chunking or
 * retrieval rather than the loop working as intended.
 */
export default function DashboardPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiFetch<AnalyticsDto>("/analytics"),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground mt-1.5 font-serif text-sm">
            Everything in your account, and how well it is answering.
          </p>
        </header>

        {isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_value, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <p className="border-stamp/30 bg-stamp/5 text-stamp rounded-md border px-4 py-3 text-sm">
            Could not load your figures. Reload to try again.
          </p>
        )}

        {data && (
          <div className="space-y-10">
            <Section title="Your library">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Notebooks" value={data.notebooks} />
                <Stat
                  label="Sources"
                  value={data.sources.total}
                  note={`${data.sources.ready} ready${
                    data.sources.failed > 0
                      ? `, ${data.sources.failed} failed`
                      : ""
                  }`}
                />
                <Stat label="Passages indexed" value={data.index.chunks} />
                <Stat
                  label="Tokens indexed"
                  value={compact(data.index.tokens)}
                  note={bytes(data.index.storedBytes) + " stored"}
                />
              </div>

              {data.sources.byType.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {data.sources.byType.map((row) => {
                    const Icon = sourceIcon[row.type] ?? FileText;
                    return (
                      <div
                        key={row.type}
                        className="bg-card rounded-lg border p-3"
                      >
                        <Icon
                          className="text-muted-foreground size-4"
                          strokeWidth={1.5}
                        />
                        <p className="mt-2 font-mono text-lg tabular-nums">
                          {row.count}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {row.type}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section
              title="How it is answering"
              blurb="These are the numbers worth acting on."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Questions asked" value={data.answers.questions} />
                <Stat
                  label="Answers with a citation"
                  value={percent(data.answers.citationCoverage)}
                  note={
                    data.answers.citationCoverage === null
                      ? "No answers yet"
                      : `${data.answers.withCitations} of ${data.answers.answered}`
                  }
                  tone={grade(data.answers.citationCoverage, 0.9, 0.7)}
                />
                <Stat
                  label="Refused"
                  value={percent(data.answers.refusalRate)}
                  note={
                    data.answers.refusalRate === null
                      ? "No answers yet"
                      : "Rising means your sources do not cover the questions"
                  }
                  tone={grade(invert(data.answers.refusalRate), 0.8, 0.6)}
                />
                <Stat
                  label="Median correction rounds"
                  value={data.retrieval.medianCorrectionRounds.toFixed(1)}
                  note={
                    data.retrieval.medianCorrectionRounds > 0
                      ? "Above zero points at chunking or retrieval"
                      : "Questions are answered first time"
                  }
                  tone={
                    data.retrieval.medianCorrectionRounds > 0.5
                      ? "warn"
                      : "good"
                  }
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Stat label="Retrieval runs" value={data.retrieval.runs} />
                <Stat
                  label="Average context grade"
                  value={
                    data.retrieval.runs > 0
                      ? `${data.retrieval.averageContextGrade.toFixed(1)} / 10`
                      : "—"
                  }
                />
                <Stat
                  label="Median retrieval time"
                  value={
                    data.retrieval.runs > 0
                      ? `${data.retrieval.medianLatencyMs} ms`
                      : "—"
                  }
                />
              </div>
            </Section>

            <Section title="Last 14 days">
              <Activity activity={data.activity} />
            </Section>

            <Section title="Generated">
              <div className="grid gap-4 sm:grid-cols-2">
                <Stat label="Roadmaps" value={data.artifacts.roadmaps} />
                <Stat
                  label="Podcast episodes"
                  value={data.artifacts.podcasts}
                />
              </div>
            </Section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {blurb && <p className="text-muted-foreground text-xs">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={
          "mt-1.5 font-mono text-2xl tabular-nums " +
          (tone === "bad"
            ? "text-stamp"
            : tone === "warn"
              ? "text-foreground"
              : "")
        }
      >
        {value}
      </p>
      {note && (
        <p className="text-muted-foreground mt-1 text-xs leading-snug">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * Two series on one baseline. Deliberately not a charting library: it is
 * fourteen bars, and shipping a dependency for that would cost more to load
 * than the whole page.
 */
function Activity({ activity }: { activity: AnalyticsDto["activity"] }) {
  const peak = Math.max(
    1,
    ...activity.map((day) => Math.max(day.sources, day.questions)),
  );

  return (
    <div className="bg-card rounded-lg border p-4">
      {/* The column needs its own resolved height, otherwise the bars inside
          size against `auto` and collapse to nothing. */}
      <div className="flex h-32 items-stretch gap-1">
        {activity.map((day) => (
          <div key={day.day} className="flex h-full flex-1 flex-col gap-1">
            <div className="flex min-h-0 flex-1 items-end justify-center gap-0.5">
              <div
                className="bg-primary/70 w-1/2 rounded-t-sm"
                style={{
                  height: `${Math.max(day.questions ? 4 : 0, (day.questions / peak) * 100)}%`,
                }}
                title={`${day.questions} questions on ${day.day}`}
              />
              <div
                className="bg-muted-foreground/40 w-1/2 rounded-t-sm"
                style={{
                  height: `${Math.max(day.sources ? 4 : 0, (day.sources / peak) * 100)}%`,
                }}
                title={`${day.sources} sources on ${day.day}`}
              />
            </div>
            <span className="text-muted-foreground shrink-0 text-center font-mono text-[9px]">
              {day.day.slice(8)}
            </span>
          </div>
        ))}
      </div>

      <div className="text-muted-foreground mt-3 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary/70 size-2 rounded-sm" /> Questions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground/30 size-2 rounded-sm" /> Sources
          added
        </span>
      </div>
    </div>
  );
}

const compact = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}k`
      : String(value);

const bytes = (value: number) =>
  value >= 1_048_576
    ? `${(value / 1_048_576).toFixed(1)} MB`
    : value >= 1024
      ? `${Math.round(value / 1024)} KB`
      : `${value} B`;

const percent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

/** Higher is better; null means there is nothing to judge yet. */
const grade = (
  value: number | null,
  good: number,
  ok: number,
): "good" | "warn" | "bad" | undefined =>
  value === null
    ? undefined
    : value >= good
      ? "good"
      : value >= ok
        ? "warn"
        : "bad";

const invert = (value: number | null) => (value === null ? null : 1 - value);
