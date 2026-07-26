"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api-client";
import type { NotebookListItemDto } from "@/types/api";

/**
 * FR-8.4: create, rename and delete apply immediately and roll back on failure.
 * Each mutation cancels in flight refetches first, snapshots the list, writes the
 * expected result, and restores the snapshot if the request fails. A toast
 * explains the rollback, because a row silently reverting is worse than an error.
 */

const TEMP_ID_PREFIX = "optimistic-";

export const isOptimistic = (id: string): boolean =>
  id.startsWith(TEMP_ID_PREFIX);

function message(error: unknown, fallback: string): string {
  // A 4xx message is written for the user and says something useful, for example
  // a name length limit. A 5xx message describes a server failure and means
  // nothing to them, so the action specific fallback is better.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return error.message;
  }
  return fallback;
}

export function useNotebooks() {
  return useQuery({
    queryKey: queryKeys.notebooks.list(),
    queryFn: api.fetchNotebooks,
  });
}

export function useCreateNotebook() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (name?: string) => api.createNotebook(name),

    onMutate: async (name) => {
      await client.cancelQueries({ queryKey: queryKeys.notebooks.list() });
      const previous = client.getQueryData<NotebookListItemDto[]>(
        queryKeys.notebooks.list(),
      );

      const now = new Date().toISOString();
      const optimistic: NotebookListItemDto = {
        id: `${TEMP_ID_PREFIX}${now}`,
        name: name?.trim() || "Untitled notebook",
        createdAt: now,
        updatedAt: now,
        sourceCount: 0,
        lastActivityAt: now,
      };

      client.setQueryData<NotebookListItemDto[]>(
        queryKeys.notebooks.list(),
        (old) => [optimistic, ...(old ?? [])],
      );

      return { previous, optimisticId: optimistic.id };
    },

    onError: (error, _name, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.notebooks.list(), context.previous);
      }
      toast.error(message(error, "Could not create the notebook"));
    },

    onSuccess: (created, _name, context) => {
      // Swap the placeholder for the real row so its id is usable before the
      // refetch lands.
      client.setQueryData<NotebookListItemDto[]>(
        queryKeys.notebooks.list(),
        (old) =>
          (old ?? []).map((notebook) =>
            notebook.id === context.optimisticId
              ? {
                  ...created,
                  sourceCount: 0,
                  lastActivityAt: created.updatedAt,
                }
              : notebook,
          ),
      );
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
    },
  });
}

export function useRenameNotebook() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.renameNotebook(id, name),

    onMutate: async ({ id, name }) => {
      await client.cancelQueries({ queryKey: queryKeys.notebooks.list() });
      const previous = client.getQueryData<NotebookListItemDto[]>(
        queryKeys.notebooks.list(),
      );

      client.setQueryData<NotebookListItemDto[]>(
        queryKeys.notebooks.list(),
        (old) =>
          (old ?? []).map((notebook) =>
            notebook.id === id ? { ...notebook, name: name.trim() } : notebook,
          ),
      );

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.notebooks.list(), context.previous);
      }
      toast.error(message(error, "Could not rename the notebook"));
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
    },
  });
}

export function useDeleteNotebook() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteNotebook(id),

    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: queryKeys.notebooks.list() });
      const previous = client.getQueryData<NotebookListItemDto[]>(
        queryKeys.notebooks.list(),
      );

      client.setQueryData<NotebookListItemDto[]>(
        queryKeys.notebooks.list(),
        (old) => (old ?? []).filter((notebook) => notebook.id !== id),
      );

      return { previous };
    },

    onError: (error, _id, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.notebooks.list(), context.previous);
      }
      toast.error(message(error, "Could not delete the notebook"));
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
    },
  });
}
