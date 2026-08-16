"use client";

import { useCallback, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { stopGeneration } from "./api";
import { ApiError } from "@/lib/api-client";
import { creditRefusal } from "@/features/billing/hooks";
import { useUiStore } from "@/stores/ui-store";
import type { ApiErrorBody, CitationDto } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * The answer arrives as a stream of phase events followed by tokens. The phase
 * events are what let the UI say what it is doing, including when it widens the
 * search, rather than showing one long spinner.
 */
export type StreamPhase =
  | { kind: "idle" }
  | { kind: "searching"; sourceCount: number }
  | { kind: "translated"; variants: Record<string, unknown> }
  | { kind: "routing"; channels: string[]; reason: string }
  | { kind: "grading"; round: number; score: number }
  | { kind: "correcting"; round: number; keywords: string[] }
  | { kind: "generating" };

export type StreamState = {
  phase: StreamPhase;
  content: string;
  citations: CitationDto[];
  messageId: string | null;
  error: string | null;
  ungrounded: boolean;
  streaming: boolean;
};

const initial: StreamState = {
  phase: { kind: "idle" },
  content: "",
  citations: [],
  messageId: null,
  error: null,
  ungrounded: false,
  streaming: false,
};

export function useChatStream(notebookId: string, onFinished: () => void) {
  const [state, setState] = useState<StreamState>(initial);
  const controller = useRef<AbortController | null>(null);

  const reset = useCallback(() => setState(initial), []);

  const send = useCallback(
    async (chatId: string, content: string, sourceIds?: string[]) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;

      // Set by `onopen` when it has already written a precise failure, so
      // `onerror` knows not to replace it with a generic one.
      let handled = false;

      setState({
        ...initial,
        streaming: true,
        phase: { kind: "searching", sourceCount: 0 },
      });

      try {
        await fetchEventSource(
          `${API_URL}/api/notebooks/${notebookId}/chats/${chatId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, sourceIds }),
            signal: abort.signal,
            // The stream is a cross origin request to the API, so it needs the
            // session cookie like every other call.
            credentials: "include",
            // Without this the browser suspends the stream when the tab is hidden.
            openWhenHidden: true,

            /**
             * The credit gate refuses before a single token is streamed, so the
             * refusal arrives as an ordinary JSON response rather than as a
             * stream event. Without this it fell through to `onerror` and the
             * reader was told the connection had been lost — which is both
             * wrong and unactionable, when the real answer is that they are out
             * of credits and can do something about it.
             */
            async onopen(response) {
              const streaming = response.headers
                .get("content-type")
                ?.includes("text/event-stream");

              if (response.ok && streaming) return;

              const body: unknown = await response.json().catch(() => null);
              const failure =
                body && typeof body === "object" && "error" in body
                  ? new ApiError(
                      response.status,
                      (body as { error: ApiErrorBody }).error,
                    )
                  : new ApiError(response.status, {
                      code: "HTTP_ERROR",
                      message: `The API returned HTTP ${response.status}.`,
                    });

              const refusal = creditRefusal(failure);
              handled = true;

              // A refusal about credits goes to the shared dialog rather than
              // into this state: it is not a fact about the answer, it is an
              // account-level thing with a remedy, and the same dialog serves
              // uploads and audio overviews.
              if (refusal) useUiStore.getState().setRefusal(refusal);

              setState((previous) => ({
                ...previous,
                streaming: false,
                phase: { kind: "idle" },
                error: refusal ? null : failure.message,
              }));

              onFinished();
              // Stops the library reconnecting to a request that will be refused
              // again for the same reason.
              throw failure;
            },

            onmessage(message) {
              const data: unknown = message.data
                ? JSON.parse(message.data)
                : {};

              setState((previous) => {
                switch (message.event) {
                  case "retrieval_start":
                    return {
                      ...previous,
                      phase: {
                        kind: "searching",
                        sourceCount: (data as { sourceCount: number })
                          .sourceCount,
                      },
                    };
                  case "query_translated":
                    return {
                      ...previous,
                      phase: {
                        kind: "translated",
                        variants: data as Record<string, unknown>,
                      },
                    };
                  case "routing": {
                    const routing = data as {
                      channels: string[];
                      reason: string;
                    };
                    return {
                      ...previous,
                      phase: {
                        kind: "routing",
                        channels: routing.channels,
                        reason: routing.reason,
                      },
                    };
                  }
                  case "grading": {
                    const grade = data as { round: number; score: number };
                    return {
                      ...previous,
                      phase: {
                        kind: "grading",
                        round: grade.round,
                        score: grade.score,
                      },
                    };
                  }
                  case "correction": {
                    const correction = data as {
                      round: number;
                      keywords: string[];
                    };
                    return {
                      ...previous,
                      phase: {
                        kind: "correcting",
                        round: correction.round,
                        keywords: correction.keywords,
                      },
                    };
                  }
                  case "retrieval_done":
                    return { ...previous, phase: { kind: "generating" } };
                  case "token":
                    return {
                      ...previous,
                      phase: { kind: "generating" },
                      content:
                        previous.content + (data as { text: string }).text,
                    };
                  case "citations":
                    return { ...previous, citations: data as CitationDto[] };
                  case "answer_grade":
                    return {
                      ...previous,
                      ungrounded: !(data as { grounded: boolean }).grounded,
                    };
                  case "done":
                    return {
                      ...previous,
                      streaming: false,
                      phase: { kind: "idle" },
                      messageId: (data as { messageId: string }).messageId,
                    };
                  case "error":
                    return {
                      ...previous,
                      streaming: false,
                      error: (data as { message: string }).message,
                    };
                  default:
                    return previous;
                }
              });

              if (message.event === "done" || message.event === "error") {
                abort.abort();
                onFinished();
              }
            },

            onerror(error) {
              // `onopen` rethrows to stop the retry loop, which lands here. It
              // has already written a precise reason, and overwriting it with a
              // generic one would undo the whole point of handling it there.
              if (!handled) {
                setState((previous) => ({
                  ...previous,
                  streaming: false,
                  error: "The connection to the server was lost.",
                }));
              }
              // Rethrowing stops the library retrying forever behind a dead server.
              throw error;
            },
          },
        );
      } catch {
        // Aborting on `done` lands here; the state is already correct.
      }
    },
    [notebookId, onFinished],
  );

  /**
   * Stopping is an intent published to the worker, not a dropped connection.
   * The worker checks it between tokens and persists what it produced, so the
   * transcript keeps the partial answer with its citations resolved.
   */
  const stop = useCallback(
    (chatId: string, messageId: string | null) => {
      if (messageId) {
        void stopGeneration(notebookId, chatId, messageId).catch(
          () => undefined,
        );
      }
      controller.current?.abort();
      setState((previous) => ({
        ...previous,
        streaming: false,
        phase: { kind: "idle" },
      }));
      onFinished();
    },
    [notebookId, onFinished],
  );

  return { state, send, stop, reset };
}
