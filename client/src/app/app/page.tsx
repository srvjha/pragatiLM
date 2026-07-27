"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateNotebookDialog } from "@/components/notebooks/create-notebook-dialog";
import { NOTEBOOK_TEMPLATES } from "@/components/notebooks/notebook-templates";
import { RelativeTime } from "@/components/notebooks/relative-time";
import {
  isOptimistic,
  useCreateNotebook,
  useNotebooks,
} from "@/features/notebooks/hooks";
import { cn } from "@/lib/utils";
import type { NotebookListItemDto } from "@/types/api";

/**
 * The shell every notebook card and every loading placeholder is built from.
 *
 * Both share it verbatim, and the pieces inside are fixed height, so the
 * skeleton grid occupies exactly the space the real grid will: FR-8.2 asks for
 * no layout jump, and the only reliable way to get one is for the two to be
 * measured by the same rules rather than by an approximation.
 */
const CARD_SHELL = "bg-card relative flex flex-col rounded-xl border p-5";

export default function AppHome() {
  const { data: notebooks, isPending, isError, refetch } = useNotebooks();
  const create = useCreateNotebook();
  const router = useRouter();

  /**
   * Which template was clicked, so the spinner appears on that card rather
   * than on all six. The mutation only knows that something is in flight.
   */
  const [startingTemplate, setStartingTemplate] = useState<string | null>(null);

  const hasNone = !isPending && !isError && notebooks?.length === 0;

  /** One click from an empty screen into a named notebook, ready for sources. */
  function start(name: string, templateId?: string) {
    setStartingTemplate(templateId ?? null);
    create.mutate(name, {
      onSuccess: (created) => router.push(`/app/${created.id}`),
      onSettled: () => setStartingTemplate(null),
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div className="max-w-xl">
            <p className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.16em] uppercase">
              {notebooks && notebooks.length > 0
                ? `${notebooks.length} ${notebooks.length === 1 ? "notebook" : "notebooks"}`
                : "Your workspace"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Your notebooks
            </h1>
            <p className="text-muted-foreground mt-2 font-serif text-[0.95rem] leading-relaxed">
              A notebook answers only from the sources you put in it, and cites
              every claim back to the page or timestamp it came from.
            </p>
          </div>

          {/* On an empty screen the panel below owns the primary action, so the
              header steps down to outline: two identical blue buttons would
              leave a first time user choosing between them for no reason. */}
          <CreateNotebookDialog
            trigger={
              <Button
                size="lg"
                variant={hasNone ? "outline" : "default"}
                className="w-full shrink-0 sm:w-auto"
              >
                <Plus className="size-4" />
                New notebook
              </Button>
            }
            onCreate={(name) => start(name)}
          />
        </header>

        {isPending && (
          <div className="mt-8" aria-busy="true" aria-label="Loading notebooks">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((card) => (
                <NotebookCardSkeleton key={card} />
              ))}
            </ul>
          </div>
        )}

        {isError && (
          <div className="border-stamp/30 bg-stamp/5 mt-8 rounded-xl border p-8 text-center">
            <AlertCircle className="text-stamp mx-auto size-5" />
            <h2 className="mt-3 font-medium">Could not load your notebooks</h2>
            <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm font-serif text-sm leading-relaxed">
              Nothing has been lost. The list failed to reach us, which is
              usually the connection rather than the notebooks.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {hasNone && (
          <div className="mt-8">
            <div className="bg-card rounded-xl border border-dashed px-6 py-10 text-center">
              <h2 className="text-lg font-semibold">
                Start your first notebook
              </h2>
              <p className="text-muted-foreground mx-auto mt-2 max-w-md font-serif text-[0.95rem] leading-relaxed">
                Put your PDFs, pages and transcripts in one, ask it a question,
                and every sentence of the answer opens the source it came from.
              </p>

              <div className="mt-6 flex justify-center">
                <CreateNotebookDialog
                  trigger={
                    <Button size="lg" disabled={create.isPending}>
                      <Plus className="size-4" />
                      Create a notebook
                    </Button>
                  }
                  onCreate={(name) => start(name)}
                />
              </div>
            </div>

            {/* Templates are the answer to the question an empty screen actually
                provokes, which is not "what do I call it" but "what is this
                for". Each one names the kind of source that makes it work. */}
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground font-mono text-[0.7rem] tracking-widest uppercase">
                  or start from
                </span>
                <span className="bg-border h-px flex-1" />
              </div>

              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {NOTEBOOK_TEMPLATES.map((template) => {
                  const starting = startingTemplate === template.id;

                  return (
                    <li key={template.id}>
                      <button
                        type="button"
                        disabled={create.isPending}
                        aria-busy={starting}
                        onClick={() => start(template.name, template.id)}
                        className={cn(
                          CARD_SHELL,
                          "focus-visible:outline-ring h-full w-full cursor-pointer text-left transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-60",
                          "not-disabled:hover:border-primary/40 not-disabled:hover:-translate-y-0.5 not-disabled:hover:shadow-md",
                          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                        )}
                      >
                        <span className="flex h-5 items-center">
                          {starting ? (
                            <Loader2 className="text-primary size-5 animate-spin" />
                          ) : (
                            <template.icon
                              className="text-muted-foreground size-5"
                              strokeWidth={1.5}
                              aria-hidden
                            />
                          )}
                        </span>
                        <span className="mt-3 block text-[0.95rem] font-medium">
                          {template.name}
                        </span>
                        <span className="text-muted-foreground mt-1 block font-serif text-sm leading-relaxed">
                          {template.blurb}
                        </span>
                        <span className="text-muted-foreground mt-4 block border-t pt-3 font-mono text-[0.7rem] leading-relaxed">
                          {template.firstStep}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {notebooks && notebooks.length > 0 && (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notebooks.map((notebook) => (
              <NotebookCard key={notebook.id} notebook={notebook} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function NotebookCard({ notebook }: { notebook: NotebookListItemDto }) {
  // A card the server has not confirmed yet has no real id, so linking it would
  // send the person to a notebook that does not exist. It reads as in progress
  // instead until the created row replaces it.
  const pending = isOptimistic(notebook.id);

  return (
    <li
      aria-busy={pending || undefined}
      className={cn(
        CARD_SHELL,
        "group transition-[transform,box-shadow] duration-150 ease-out",
        // The whole card is the hit area, but only the title is focusable, so
        // the ring has to be drawn on the card rather than on the link itself.
        "has-[a:focus-visible]:outline-ring has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2",
        pending
          ? "opacity-60"
          : "hover:border-foreground/15 hover:-translate-y-0.5 hover:shadow-md",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <h2 className="min-h-[2.75rem] text-[0.95rem] leading-snug font-medium">
        {pending ? (
          <span className="line-clamp-2">{notebook.name}</span>
        ) : (
          <Link
            href={`/app/${notebook.id}`}
            // The overlay is what makes the card clickable without nesting a
            // second control inside the link.
            className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {notebook.name}
          </Link>
        )}
      </h2>

      <p className="text-muted-foreground mt-2 font-mono text-[0.7rem]">
        {notebook.sourceCount}{" "}
        {notebook.sourceCount === 1 ? "source" : "sources"}
        {" · "}
        {pending ? "just now" : <RelativeTime iso={notebook.lastActivityAt} />}
      </p>

      <div className="mt-5 border-t pt-3">
        <div className="flex h-5 items-center justify-between gap-2">
          {pending ? (
            <span className="text-muted-foreground text-xs">Creating…</span>
          ) : (
            <span className="text-primary flex items-center gap-1.5 text-xs font-medium">
              Open notebook
              <ArrowRight
                className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                aria-hidden
              />
            </span>
          )}

          {!pending && notebook.sourceCount === 0 && (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide uppercase">
              no sources
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function NotebookCardSkeleton() {
  return (
    <li className={CARD_SHELL} aria-hidden>
      <div className="min-h-[2.75rem] space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <Skeleton className="mt-2 h-3 w-1/2" />
      <div className="mt-5 border-t pt-3">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </li>
  );
}
