"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUp,
  Loader2,
  RotateCw,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnswerMarkdown } from "./markdown";
import { PhaseIndicator } from "./phase-indicator";
import { CitationChips } from "./citation-chips";
import * as api from "@/features/chat/api";
import { useChatStream } from "@/features/chat/use-chat-stream";
import { useSources } from "@/features/sources/hooks";
import { queryKeys } from "@/lib/query-keys";
import { isQueryable } from "@/lib/source-status";
import { useUiStore } from "@/stores/ui-store";
import type { CitationDto, MessageDto } from "@/types/api";

export function ChatPanel({ notebookId }: { notebookId: string }) {
  const client = useQueryClient();
  const { data: sources } = useSources(notebookId);
  const setViewerCitation = useUiStore((state) => state.setViewerCitation);

  const ready = (sources ?? []).filter(isQueryable);
  const canAsk = ready.length > 0;

  const { data: chats } = useQuery({
    queryKey: queryKeys.chats.list(notebookId),
    queryFn: () => api.fetchChats(notebookId),
  });

  const chatId = chats?.[0]?.id ?? null;

  const createChat = useMutation({
    mutationFn: () => api.createChat(notebookId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.chats.list(notebookId) }),
  });

  // One chat per notebook for now; the transcript is the notebook's history.
  useEffect(() => {
    if (chats && chats.length === 0 && !createChat.isPending)
      createChat.mutate();
  }, [chats, createChat]);

  const { data: messages } = useQuery({
    queryKey: queryKeys.chats.messages(chatId ?? "none"),
    queryFn: () => api.fetchMessages(notebookId, chatId ?? ""),
    enabled: chatId !== null,
  });

  const onFinished = useCallback(() => {
    void client.invalidateQueries({
      queryKey: queryKeys.chats.messages(chatId ?? "none"),
    });
  }, [client, chatId]);

  const { state, send, stop, reset } = useChatStream(notebookId, onFinished);
  const [draft, setDraft] = useState("");
  const [lastAsked, setLastAsked] = useState("");

  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Auto scroll yields the moment the user scrolls up, so reading earlier
  // context is not fought by the stream.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, state.content, state.phase]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    pinned.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  function submit() {
    const question = draft.trim();
    if (!question || !chatId || state.streaming) return;

    setDraft("");
    setLastAsked(question);
    pinned.current = true;
    void send(chatId, question);
  }

  function openCitation(citation: CitationDto) {
    setViewerCitation({
      sourceId: citation.sourceId,
      locator: citation.locator,
      // Carried so the viewer can highlight the quoted text, not just turn to
      // the page it is on.
      snippet: citation.snippet,
    });
  }

  // The grade arrives after the stream, so it is held here rather than on the
  // persisted row, which the transcript refetch would overwrite.
  const ungroundedIds = new Set(
    state.ungrounded && state.messageId ? [state.messageId] : [],
  );

  const persisted = (messages ?? []).filter(
    (message) => message.status !== "streaming" || message.content.length > 0,
  );

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {persisted.length === 0 && !state.streaming && (
            <EmptyState
              canAsk={canAsk}
              titles={ready.map((source) => source.title)}
              onPick={(question) => {
                setDraft(question);
              }}
            />
          )}

          {persisted.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              ungrounded={ungroundedIds.has(message.id)}
              onCite={openCitation}
            />
          ))}

          {state.streaming && (
            <div className="flex flex-col gap-2">
              <PhaseIndicator phase={state.phase} />
              {state.content.length > 0 && (
                <div className="text-sm">
                  <AnswerMarkdown
                    content={state.content}
                    citations={state.citations}
                    onCite={openCitation}
                  />
                  <span className="bg-foreground ml-0.5 inline-block h-4 w-1.5 animate-pulse align-text-bottom" />
                </div>
              )}
            </div>
          )}

          {state.error && (
            <div className="border-destructive/40 bg-destructive/10 flex items-start gap-3 rounded-lg border p-3 text-sm">
              <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p>{state.error}</p>
                {/* The question is preserved, so a retry costs nothing. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    reset();
                    if (chatId && lastAsked) void send(chatId, lastAsked);
                  }}
                >
                  <RotateCw className="size-3.5" />
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t p-3">
        <div className="mx-auto max-w-3xl">
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // FR-8.5: Enter sends, Shift+Enter is a newline.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              disabled={!canAsk}
              rows={1}
              aria-label="Ask a question"
              placeholder={
                canAsk
                  ? "Ask anything about your sources..."
                  : "Add a source and wait for it to turn green before asking"
              }
              className="max-h-40 min-h-11 resize-none pr-12"
            />

            <div className="absolute right-2 bottom-2">
              {state.streaming ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => chatId && stop(chatId, state.messageId)}
                  aria-label="Stop generating"
                >
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={submit}
                  disabled={!canAsk || draft.trim().length === 0}
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {!canAsk && (
            <p className="text-muted-foreground mt-2 text-xs">
              Answers come only from indexed sources, so there is nothing to
              answer from yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  ungrounded = false,
  onCite,
}: {
  message: MessageDto;
  ungrounded?: boolean;
  onCite: (citation: CitationDto) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-accent max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {message.status === "error" ? (
        <p className="text-destructive text-sm">
          {message.content || "This answer failed."}
        </p>
      ) : (
        <AnswerMarkdown
          content={message.content}
          citations={message.citations}
          onCite={onCite}
        />
      )}

      {message.status === "stopped" && (
        <p className="text-muted-foreground text-xs italic">
          Stopped before finishing.
        </p>
      )}

      {/* The PRD's post generation check: an answer the grader could not
          support is flagged rather than silently trusted. */}
      {ungrounded && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <AlertTriangle className="size-3" />
          This answer may go beyond what the sources support.
        </p>
      )}

      <CitationChips citations={message.citations} onCite={onCite} />
    </div>
  );
}

function EmptyState({
  canAsk,
  titles,
  onPick,
}: {
  canAsk: boolean;
  titles: string[];
  onPick: (question: string) => void;
}) {
  if (!canAsk) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        <Loader2 className="mx-auto mb-3 size-5 animate-spin opacity-40" />
        Waiting for a source to finish indexing.
      </div>
    );
  }

  // Derived from what is actually in the notebook, so a suggestion is never
  // about material the user does not have.
  const suggestions = [
    "Summarise the main points",
    titles[0]
      ? `What does "${trim(titles[0])}" cover?`
      : "What is covered here?",
    titles.length > 1
      ? "What do these sources disagree on?"
      : "What questions does this leave open?",
  ];

  // Centred rather than pinned to the top: an empty transcript is mostly empty
  // space, and leaving the only thing on screen floating above it reads as a
  // page that failed to load.
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-semibold">Ask anything about your sources</h2>
      <p className="text-muted-foreground mt-1.5 font-serif text-sm">
        Every answer cites the exact place it came from.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="hover:border-primary/40 hover:bg-accent bg-card rounded-md border px-3 py-1.5 text-xs transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

const trim = (title: string) =>
  title.length > 32 ? `${title.slice(0, 32)}...` : title;
