"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { CreateNotebookDialog } from "@/components/notebooks/create-notebook-dialog";
import { NOTEBOOK_TEMPLATES } from "@/components/notebooks/notebook-templates";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateNotebook, useNotebooks } from "@/features/notebooks/hooks";

export default function AppHome() {
  const { data: notebooks, isPending } = useNotebooks();
  const create = useCreateNotebook();
  const router = useRouter();

  const hasNone = !isPending && notebooks?.length === 0;

  /** One click from an empty screen into a named notebook, ready for sources. */
  function start(name: string) {
    create.mutate(name, {
      onSuccess: (created) => router.push(`/app/${created.id}`),
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-12">
        {isPending && (
          <div className="space-y-3">
            <Skeleton className="mx-auto h-7 w-56" />
            <Skeleton className="mx-auto h-4 w-80" />
          </div>
        )}

        {hasNone && (
          <>
            <div className="mx-auto max-w-xl text-center">
              <h1 className="text-3xl font-semibold">Start a notebook</h1>
              <p className="text-muted-foreground mt-3 font-serif text-base leading-relaxed">
                A notebook holds your sources. Questions are answered from those
                sources only, with a marker on every claim that opens the page
                or the timestamp it came from.
              </p>

              <div className="mt-6">
                <CreateNotebookDialog
                  trigger={
                    <Button size="lg">
                      <Plus className="size-4" />
                      Create your first notebook
                    </Button>
                  }
                  onCreate={start}
                />
              </div>
            </div>

            {/* Templates are the answer to the question an empty screen actually
                provokes, which is not "what do I call it" but "what is this
                for". Each one names the kind of source that makes it work. */}
            <div className="mt-14">
              <div className="mb-4 flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground font-mono text-[0.7rem] tracking-widest uppercase">
                  or start from
                </span>
                <span className="bg-border h-px flex-1" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {NOTEBOOK_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={create.isPending}
                    onClick={() => start(template.name)}
                    className="bg-card hover:border-primary/40 hover:bg-accent/50 group flex cursor-pointer flex-col rounded-lg border p-4 text-left transition-colors disabled:opacity-60"
                  >
                    <template.icon
                      className="text-muted-foreground group-hover:text-primary mb-3 size-5 transition-colors"
                      strokeWidth={1.5}
                    />
                    <span className="font-medium">{template.name}</span>
                    <span className="text-muted-foreground mt-1 font-serif text-sm leading-relaxed">
                      {template.blurb}
                    </span>
                    <span className="text-muted-foreground mt-3 font-mono text-[0.7rem]">
                      {template.firstStep}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {!isPending && !hasNone && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <h1 className="text-xl font-semibold">Pick a notebook</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Choose one from the left, or press{" "}
              <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                ⌘K
              </kbd>{" "}
              to search.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
