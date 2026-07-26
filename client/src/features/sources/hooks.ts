"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api-client";
import type { SourceDto } from "@/types/api";

function message(error: unknown, fallback: string): string {
  // A 4xx is written for the user, for example a duplicate or an oversized file.
  // A 5xx describes a server failure and means nothing to them.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return error.message;
  }
  return fallback;
}

export function useSources(notebookId: string | null) {
  return useQuery({
    queryKey: queryKeys.sources.list(notebookId ?? "none"),
    queryFn: () => api.fetchSources(notebookId ?? ""),
    enabled: notebookId !== null,
    // The SSE stream is the live path. This is the fallback that keeps status
    // moving if the stream drops, which is why it is slow rather than absent.
    refetchInterval: (query) => {
      const rows = query.state.data;
      const settling = rows?.some(
        (row) => row.status !== "READY" && row.status !== "FAILED",
      );
      return settling ? 5_000 : false;
    },
  });
}

function useSourceMutation<TArgs>(
  notebookId: string,
  mutationFn: (args: TArgs) => Promise<unknown>,
  fallbackMessage: string,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn,
    onError: (error) => toast.error(message(error, fallbackMessage)),
    onSettled: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.sources.list(notebookId),
      });
      void client.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
    },
  });
}

export function useAddPdfSources(notebookId: string) {
  return useSourceMutation<{
    files: File[];
    onProgress?: (percent: number) => void;
  }>(
    notebookId,
    ({ files, onProgress }) => api.addPdfSources(notebookId, files, onProgress),
    "Could not upload those PDFs",
  );
}

export function useAddVttSource(notebookId: string) {
  return useSourceMutation<{
    file: File;
    onProgress?: (percent: number) => void;
  }>(
    notebookId,
    ({ file, onProgress }) => api.addVttSource(notebookId, file, onProgress),
    "Could not upload that transcript",
  );
}

export function useAddTextSource(notebookId: string) {
  return useSourceMutation<{ title?: string; content: string }>(
    notebookId,
    (body) => api.addTextSource(notebookId, body),
    "Could not add that text",
  );
}

export function useAddWebSource(notebookId: string) {
  return useSourceMutation<string>(
    notebookId,
    (url) => api.addWebSource(notebookId, url),
    "Could not add that page",
  );
}

export function useAddYoutubeSource(notebookId: string) {
  return useSourceMutation<string>(
    notebookId,
    (url) => api.addYoutubeSource(notebookId, url),
    "Could not add that video",
  );
}

export function useRenameSource(notebookId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, title }: { sourceId: string; title: string }) =>
      api.renameSource(notebookId, sourceId, title),

    onMutate: async ({ sourceId, title }) => {
      await client.cancelQueries({
        queryKey: queryKeys.sources.list(notebookId),
      });
      const previous = client.getQueryData<SourceDto[]>(
        queryKeys.sources.list(notebookId),
      );

      client.setQueryData<SourceDto[]>(
        queryKeys.sources.list(notebookId),
        (rows) =>
          (rows ?? []).map((row) =>
            row.id === sourceId ? { ...row, title } : row,
          ),
      );

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) {
        client.setQueryData(
          queryKeys.sources.list(notebookId),
          context.previous,
        );
      }
      toast.error(message(error, "Could not rename that source"));
    },

    onSettled: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.sources.list(notebookId),
      });
    },
  });
}

/** FR-2.14. Toggling scope must feel instant, so the checkbox flips before the request lands. */
export function useToggleSourceSelected(notebookId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      sourceId,
      selected,
    }: {
      sourceId: string;
      selected: boolean;
    }) => api.setSourceSelected(notebookId, sourceId, selected),

    onMutate: async ({ sourceId, selected }) => {
      await client.cancelQueries({
        queryKey: queryKeys.sources.list(notebookId),
      });
      const previous = client.getQueryData<SourceDto[]>(
        queryKeys.sources.list(notebookId),
      );

      client.setQueryData<SourceDto[]>(
        queryKeys.sources.list(notebookId),
        (rows) =>
          (rows ?? []).map((row) =>
            row.id === sourceId ? { ...row, selected } : row,
          ),
      );

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) {
        client.setQueryData(
          queryKeys.sources.list(notebookId),
          context.previous,
        );
      }
      toast.error(message(error, "Could not change that source"));
    },
  });
}

export function useReindexSource(notebookId: string) {
  return useSourceMutation<string>(
    notebookId,
    (sourceId) => api.reindexSource(notebookId, sourceId),
    "Could not re-index that source",
  );
}

export function useDeleteSource(notebookId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) => api.deleteSource(notebookId, sourceId),

    onMutate: async (sourceId) => {
      await client.cancelQueries({
        queryKey: queryKeys.sources.list(notebookId),
      });
      const previous = client.getQueryData<SourceDto[]>(
        queryKeys.sources.list(notebookId),
      );

      client.setQueryData<SourceDto[]>(
        queryKeys.sources.list(notebookId),
        (rows) => (rows ?? []).filter((row) => row.id !== sourceId),
      );

      return { previous };
    },

    onError: (error, _sourceId, context) => {
      if (context?.previous) {
        client.setQueryData(
          queryKeys.sources.list(notebookId),
          context.previous,
        );
      }
      toast.error(message(error, "Could not remove that source"));
    },

    onSettled: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.sources.list(notebookId),
      });
      void client.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
    },
  });
}
