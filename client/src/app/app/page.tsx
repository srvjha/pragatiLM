"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { CreateNotebookDialog } from "@/components/notebooks/create-notebook-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateNotebook, useNotebooks } from "@/features/notebooks/hooks";

export default function AppHome() {
  const { data: notebooks, isPending } = useNotebooks();
  const create = useCreateNotebook();
  const router = useRouter();

  const hasNone = !isPending && notebooks?.length === 0;

  return (
    <AppShell>
      <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
        {isPending && (
          <div className="w-full space-y-3">
            <Skeleton className="mx-auto h-6 w-52" />
            <Skeleton className="mx-auto h-4 w-72" />
          </div>
        )}

        {hasNone && (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Start a notebook</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                A notebook holds your sources. Questions are answered from those
                sources only, with a marker on every claim that opens the page
                or the timestamp it came from.
              </p>
            </div>

            <CreateNotebookDialog
              trigger={
                <Button size="lg">
                  <Plus className="size-4" />
                  Create your first notebook
                </Button>
              }
              onCreate={(name) =>
                create.mutate(name, {
                  // Straight into the new notebook, which is what the user asked
                  // for by creating it.
                  onSuccess: (created) => router.push(`/app/${created.id}`),
                })
              }
            />
          </>
        )}

        {!isPending && !hasNone && (
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Pick a notebook</h1>
            <p className="text-muted-foreground text-sm">
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
