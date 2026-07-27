"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { SourceDto, SourceStatus } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type SourceEvent = {
  type: "source.status";
  sourceId: string;
  notebookId: string;
  status: SourceStatus;
  statusStage: string | null;
  progress: number;
  errorMessage: string | null;
};

/**
 * FR-2.9. One stream per notebook, patched straight into the query cache so a
 * row moves from grey through to ready without a refetch or a page reload.
 *
 * EventSource rather than fetch-event-source: this stream carries no auth header
 * and needs no POST body, and EventSource reconnects on its own. Polling is the
 * fallback if the stream cannot be established at all.
 */
export function useSourceEvents(notebookId: string | null): void {
  const client = useQueryClient();
  const failures = useRef(0);

  useEffect(() => {
    if (!notebookId) return;

    const source = new EventSource(
      `${API_URL}/api/notebooks/${notebookId}/sources/events`,
    );

    source.addEventListener("message", (event: MessageEvent<string>) => {
      let payload: SourceEvent;
      try {
        payload = JSON.parse(event.data) as SourceEvent;
      } catch {
        return;
      }

      if (payload.type !== "source.status") return;

      client.setQueryData<SourceDto[]>(
        queryKeys.sources.list(notebookId),
        (rows) =>
          (rows ?? []).map((row) =>
            row.id === payload.sourceId
              ? {
                  ...row,
                  status: payload.status,
                  statusStage: payload.statusStage,
                  progress: payload.progress,
                  errorMessage: payload.errorMessage,
                }
              : row,
          ),
      );

      // READY carries an indexedAt and possibly a real title, neither of which
      // the event includes, so that one transition earns a refetch.
      if (payload.status === "READY" || payload.status === "FAILED") {
        void client.invalidateQueries({
          queryKey: queryKeys.sources.list(notebookId),
        });
        void client.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
      }
    });

    source.addEventListener("open", () => {
      failures.current = 0;
    });

    source.addEventListener("error", () => {
      failures.current += 1;

      // EventSource retries on its own. After several consecutive failures the
      // stream is treated as unavailable and the cache is refreshed by hand so
      // status is stale rather than frozen.
      if (failures.current >= 3) {
        void client.invalidateQueries({
          queryKey: queryKeys.sources.list(notebookId),
        });
      }
    });

    return () => source.close();
  }, [notebookId, client]);
}
