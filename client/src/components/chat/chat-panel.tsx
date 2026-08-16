"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FileUp,
  Loader2,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AnswerMarkdown } from "./markdown";
import { PhaseIndicator } from "./phase-indicator";
import { CitationChips } from "./citation-chips";
import { ClearChatDialog } from "./clear-chat-dialog";
import * as api from "@/features/chat/api";
import { useChatStream } from "@/features/chat/use-chat-stream";
import { useRefreshBalance } from "@/features/billing/hooks";
import { useSources } from "@/features/sources/hooks";
import { queryKeys } from "@/lib/query-keys";
import { isQueryable } from "@/lib/source-status";
import { useUiStore } from "@/stores/ui-store";
import { ApiError } from "@/lib/api-client";
import { toast } from "sonner";
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

  const refreshBalance = useRefreshBalance();

  const onFinished = useCallback(() => {
    void client.invalidateQueries({
      queryKey: queryKeys.chats.messages(chatId ?? "none"),
    });
    // Every answer spends a credit, and a failed one gives it back, so the meter
    // is only right once the server has had the last word on it.
    void refreshBalance();
  }, [client, chatId, refreshBalance]);

  const { state, send, stop, reset } = useChatStream(notebookId, onFinished);
  const [draft, setDraft] = useState("");
  const [lastAsked, setLastAsked] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  /**
   * Clearing deletes the chat rather than its messages one by one. The effect
   * above creates a chat whenever the notebook has none, so a fresh empty one
   * takes its place on the next refetch and the person can carry straight on.
   */
  const clear = useMutation({
    mutationFn: () => api.deleteChat(notebookId, chatId ?? ""),
    onSuccess: async () => {
      reset();
      setDraft("");
      setLastAsked("");
      await client.invalidateQueries({
        queryKey: queryKeys.chats.list(notebookId),
      });
      await client.invalidateQueries({
        queryKey: queryKeys.chats.messages(chatId ?? "none"),
      });
      toast.success("Chat cleared");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Could not clear the chat",
      ),
  });

  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // Mirrored into state purely so the "jump to latest" control can appear.
  // The ref stays the source of truth for the scrolling itself, because that
  // runs on every streamed token and must not re-render anything.
  const [atBottom, setAtBottom] = useState(true);

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

    const bottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;

    pinned.current = bottom;
    setAtBottom((was) => (was === bottom ? was : bottom));
  }

  function jumpToLatest() {
    const element = scroller.current;
    if (!element) return;

    pinned.current = true;
    setAtBottom(true);
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
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

  /**
   * The transcript is only refetched once an answer has finished, so between
   * the last token and that refetch landing there was a moment with neither a
   * live answer nor a persisted one, and the answer just written blinked out
   * of the page. The streamed copy stays on screen until the real row it
   * belongs to has arrived to replace it.
   */
  const landed = state.messageId
    ? persisted.some((message) => message.id === state.messageId)
    : false;
  const live = state.streaming || (state.content.length > 0 && !landed);

  return (
    <div className="flex h-full flex-col">
      {/* Only once there is something to clear. An empty transcript with a
          "Clear chat" button offers a destructive action for no reason. */}
      {persisted.length > 0 && (
        <div className="flex shrink-0 items-center justify-end border-b px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1.5"
            disabled={state.streaming || clear.isPending}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="size-3.5" />
            Clear chat
          </Button>
        </div>
      )}

      <ClearChatDialog
        open={confirmClear}
        messageCount={persisted.length}
        onOpenChange={setConfirmClear}
        onConfirm={() => {
          setConfirmClear(false);
          clear.mutate();
        }}
      />

      <div className="relative min-h-0 flex-1">
        {/* Reading back through a long answer while the next one streams is a
            normal thing to do, and there was no way back to the bottom except
            scrolling the whole way by hand. */}
        {!atBottom && persisted.length > 0 && (
          <button
            type="button"
            onClick={jumpToLatest}
            // Chrome floating over the transcript, so it is built like chrome:
            // a card on the paper rather than a high contrast slab, which was
            // covering the very line the reader had scrolled back to find.
            className="bg-card/90 text-foreground border-border motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 hover:bg-accent absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm transition-colors"
          >
            <ArrowDown className="size-3.5" />
            Jump to latest
          </button>
        )}

        <div
          ref={scroller}
          onScroll={onScroll}
          className="h-full overflow-y-auto"
        >
          {/* Narrower than the panel on purpose. The answer is set in the
              reading face at reading size, and a line of it running the full
              width of a wide column is too long to track back from the end of
              one line to the start of the next. */}
          <div className="mx-auto flex max-w-[38rem] flex-col gap-8 px-4 py-6">
            {persisted.length === 0 && !live && (
              <EmptyState
                canAsk={canAsk}
                sourceCount={sources?.length ?? 0}
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

            {/* The question, before the transcript has it. Pressing enter used
                to clear the composer and show nothing at all until the answer
                had finished, so for the length of a retrieval there was no
                sign anywhere on the page of what had been asked. */}
            {live && lastAsked && <QuestionBubble text={lastAsked} />}

            {live && (
              <div className="flex flex-col gap-3">
                <PhaseIndicator phase={state.phase} />

                {state.content.length > 0 ? (
                  <AnswerMarkdown
                    content={state.content}
                    citations={state.citations}
                    onCite={openCitation}
                    caret={state.streaming}
                  />
                ) : (
                  state.phase.kind === "generating" && <AnswerSkeleton />
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
      </div>

      <div className="bg-background/80 border-t p-3 backdrop-blur-sm">
        {/* Same measure as the transcript, so the composer sits under the
            column it belongs to rather than spanning past it. */}
        <div className="mx-auto max-w-[38rem]">
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
                  : "Add a source and wait for it to finish indexing"
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

          {/* One line under the composer, and only one: either why you cannot
              ask yet, or how to send. Showing both at once made the input look
              like it had failed validation. */}
          {!canAsk ? (
            <p className="text-muted-foreground mt-2 text-xs">
              Answers come only from indexed sources, so there is nothing to
              answer from yet.
            </p>
          ) : (
            <p className="text-muted-foreground mt-2 flex items-center gap-1.5 font-mono text-[0.68rem]">
              <kbd className="border-border bg-muted rounded border px-1 py-px">
                Enter
              </kbd>
              to send
              <span className="opacity-40">·</span>
              <kbd className="border-border bg-muted rounded border px-1 py-px">
                Shift
              </kbd>
              <span className="opacity-40">+</span>
              <kbd className="border-border bg-muted rounded border px-1 py-px">
                Enter
              </kbd>
              for a new line
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The question is the person speaking, so it stays in the interface face and is
 * bounded like a card. The answer below it is the material, set in the reading
 * face and given the full column: the contrast between the two is what tells
 * the two voices apart, rather than a pair of facing bubbles.
 */
function QuestionBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-secondary border-border max-w-[85%] rounded-lg rounded-br-[2px] border px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

/**
 * The gap between "retrieval finished" and the first token is dead air of a
 * second or two, and an empty column there reads as a stall. Three ruled lines
 * at the answer's own measure say the shape of what is coming.
 */
function AnswerSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2.5 py-1">
      <Skeleton className="h-3.5 w-full rounded-sm" />
      <Skeleton className="h-3.5 w-[92%] rounded-sm" />
      <Skeleton className="h-3.5 w-[64%] rounded-sm" />
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
  if (message.role === "user") return <QuestionBubble text={message.content} />;

  return (
    <div className="group/answer flex flex-col">
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
        <p className="text-muted-foreground mt-2 text-xs italic">
          Stopped before finishing.
        </p>
      )}

      {/* The PRD's post generation check: an answer the grader could not
          support is flagged rather than silently trusted. */}
      {ungrounded && (
        <p className="border-border text-muted-foreground mt-3 flex items-start gap-1.5 border-l-2 py-0.5 pl-2.5 text-xs">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          This answer may go beyond what the sources support.
        </p>
      )}

      <CitationChips citations={message.citations} onCite={onCite} />

      {/* Under the sources rather than above them, because the sources are part
          of the answer and the controls are not. Dimmed rather than hidden: a
          control that only exists on hover cannot be found on a touch screen,
          and fading it in place costs no layout. */}
      {message.status !== "error" && <CopyAnswer text={message.content} />}
    </div>
  );
}

/**
 * Copies the answer as the model wrote it, markers and all.
 *
 * Deliberately the raw markdown rather than the rendered text: the [1] markers
 * are the part worth keeping, since they are what makes the answer checkable
 * once it has been pasted somewhere else.
 */
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  if (text.trim().length === 0) return null;

  return (
    <div className="mt-2 flex opacity-45 transition-opacity group-hover/answer:opacity-100 focus-within:opacity-100">
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground hover:text-foreground -ml-2 gap-1.5"
        aria-label={copied ? "Answer copied" : "Copy this answer"}
        onClick={() => {
          navigator.clipboard
            .writeText(text)
            .then(() => setCopied(true))
            .catch(() => toast.error("Could not copy the answer"));
        }}
      >
        {copied ? (
          <Check className="size-3 text-primary" />
        ) : (
          <Copy className="size-3" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function EmptyState({
  canAsk,
  sourceCount,
  titles,
  onPick,
}: {
  canAsk: boolean;
  /** Every source in the notebook, not just the ready ones. */
  sourceCount: number;
  titles: string[];
  onPick: (question: string) => void;
}) {
  // A notebook with nothing in it is waiting for the person, not for a job.
  // Showing a spinner here claimed work was happening that had never been
  // started, and left a new notebook looking broken.
  if (sourceCount === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <FileUp
          className="text-muted-foreground mb-4 size-8"
          strokeWidth={1.25}
        />
        <h2 className="text-lg font-semibold">Add a source to get started</h2>
        <p className="text-muted-foreground mt-1.5 max-w-sm font-serif text-sm leading-relaxed">
          A PDF, a YouTube link, a web page, a transcript or pasted text.
          Questions are answered from what you add here and nothing else.
        </p>
      </div>
    );
  }

  // Sources exist but none is queryable yet, so this genuinely is a wait.
  if (!canAsk) {
    return (
      <div className="text-muted-foreground flex min-h-[60vh] flex-col items-center justify-center px-6 text-center text-sm">
        <Loader2 className="mb-3 size-5 animate-spin opacity-40" />
        Indexing your {sourceCount === 1 ? "source" : "sources"}. You can ask as
        soon as the first one is ready.
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
