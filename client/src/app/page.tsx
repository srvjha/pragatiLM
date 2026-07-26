"use client";

import { NotebookPen, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { CreateNotebookDialog } from "@/components/notebooks/create-notebook-dialog";
import { useRouter } from "next/navigation";
import { useCreateNotebook, useNotebooks } from "@/features/notebooks/hooks";

export default function Home() {
  const { data: notebooks, isPending } = useNotebooks();
  const create = useCreateNotebook();
  const router = useRouter();

  const hasNone = !isPending && notebooks?.length === 0;

  return (
    <AppShell>
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        {hasNone && (
          <>
            <NotebookPen
              className="text-muted-foreground size-10"
              strokeWidth={1.5}
            />
            <div>
              <h1 className="text-xl font-semibold">
                Create your first notebook
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                A notebook holds your sources and answers questions only from
                them, with a citation on every claim.
              </p>
            </div>
            <CreateNotebookDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Create your first notebook
                </Button>
              }
              onCreate={(name) =>
                create.mutate(name, {
                  // Straight into the new notebook, which is what the user asked
                  // for by creating it.
                  onSuccess: (created) =>
                    router.push(`/notebook/${created.id}`),
                })
              }
            />
          </>
        )}

        {!hasNone && (
          <p className="text-muted-foreground text-sm">
            Select a notebook to begin, or press{" "}
            <kbd className="bg-muted rounded px-1.5 py-0.5 text-[11px]">⌘K</kbd>{" "}
            to search.
          </p>
        )}
      </div>
    </AppShell>
  );
}
