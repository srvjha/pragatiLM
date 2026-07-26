import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { validate } from "@/middleware/validate";
import { requireNotebook } from "@/middleware/ownership";
import { notFound } from "@/lib/errors";
import * as repo from "@/db/repositories/chat.repository";
import { enqueueAnswer } from "@/queues";
import { channels, createSubscriber } from "@/lib/events";
import { replay, requestStop, type ChatEvent } from "@/lib/chat-stream";
import { childLogger } from "@/lib/logger";

const log = childLogger("chat:route");

export const chatRouter: Router = Router({ mergeParams: true });

const chatIdParams = z.object({ notebookId: z.uuid(), chatId: z.uuid() });
const messageIdParams = chatIdParams.extend({ messageId: z.uuid() });
const createChatBody = z.object({ title: z.string().trim().max(200).optional() });
const sendMessageBody = z.object({
  content: z.string().trim().min(1, "Ask a question"),
  sourceIds: z.array(z.uuid()).optional(),
});

chatRouter.get("/", (req, res, next) => {
  repo
    .listChats(requireNotebook(req).id)
    .then((data) => res.json({ data }))
    .catch(next);
});

chatRouter.post("/", validate({ body: createChatBody }), (req, res, next) => {
  const body = req.body as z.infer<typeof createChatBody>;

  repo
    .createChat(requireNotebook(req).id, body.title?.trim() || "New chat")
    .then((data) => res.status(201).json({ data }))
    .catch(next);
});

chatRouter.get("/:chatId/messages", validate({ params: chatIdParams }), (req, res, next) => {
  const chatId = String(req.params.chatId);

  repo
    .findChat(requireNotebook(req).id, chatId)
    .then(async (chat) => {
      if (!chat) throw notFound("Chat not found");
      res.json({ data: await repo.listMessages(chatId) });
    })
    .catch(next);
});

chatRouter.delete("/:chatId", validate({ params: chatIdParams }), (req, res, next) => {
  repo
    .deleteChat(requireNotebook(req).id, String(req.params.chatId))
    .then((deleted) => {
      if (!deleted) throw notFound("Chat not found");
      res.status(204).end();
    })
    .catch(next);
});

/**
 * NFR-3. This handler never awaits a model call: it persists the question,
 * creates the placeholder answer, enqueues the job and then holds the response
 * open, forwarding whatever the worker publishes.
 */
chatRouter.post(
  "/:chatId/messages",
  validate({ params: chatIdParams, body: sendMessageBody }),
  (req: Request, res: Response, next) => {
    const notebookId = requireNotebook(req).id;
    const chatId = String(req.params.chatId);
    const body = req.body as z.infer<typeof sendMessageBody>;

    (async () => {
      const chat = await repo.findChat(notebookId, chatId);
      if (!chat) throw notFound("Chat not found");

      await repo.insertMessage({ chatId, role: "user", content: body.content });

      const assistant = await repo.insertMessage({
        chatId,
        role: "assistant",
        content: "",
        status: "streaming",
      });

      await enqueueAnswer({
        messageId: assistant.id,
        chatId,
        notebookId,
        content: body.content,
        ...(body.sourceIds ? { sourceIds: body.sourceIds } : {}),
      });

      relay(req, res, assistant.id);
    })().catch(next);
  },
);

/** Reattaching to an answer already in flight, after a dropped connection. */
chatRouter.get(
  "/:chatId/messages/:messageId/stream",
  validate({ params: messageIdParams }),
  (req, res, next) => {
    const messageId = String(req.params.messageId);

    repo
      .findMessage(messageId)
      .then((message) => {
        if (!message) throw notFound("Message not found");
        relay(req, res, messageId);
      })
      .catch(next);
  },
);

chatRouter.post(
  "/:chatId/messages/:messageId/stop",
  validate({ params: messageIdParams }),
  (req, res, next) => {
    requestStop(String(req.params.messageId))
      .then(() => res.status(202).json({ data: { stopped: true } }))
      .catch(next);
  },
);

/**
 * Subscribes to the message channel and forwards frames verbatim. Everything
 * already buffered is replayed first, so a client that reconnects mid answer
 * misses nothing and then continues live.
 */
function relay(req: Request, res: Response, messageId: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const subscriber = createSubscriber();
  const seen = new Set<string>();
  let closed = false;

  const write = (frame: ChatEvent) => {
    if (closed) return;
    res.write(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    void subscriber.quit().catch(() => undefined);
    res.end();
  };

  const heartbeat = setInterval(() => {
    if (!closed) res.write(": keep-alive\n\n");
  }, 25_000);

  req.on("close", close);

  void (async () => {
    // Subscribe before replaying, so a frame published during the replay is not
    // lost between the two.
    await subscriber.subscribe(channels.chat(messageId)).catch((error: unknown) => {
      log.error({ err: error, messageId }, "could not subscribe to the answer");
      close();
    });

    subscriber.on("message", (_channel, payload) => {
      const frame = JSON.parse(payload) as ChatEvent;
      const key = `${frame.event}:${JSON.stringify(frame.data)}`;

      // The replay and the live subscription can overlap by a frame or two.
      if (frame.event === "token" || !seen.has(key)) {
        if (frame.event !== "token") seen.add(key);
        write(frame);
      }

      if (frame.event === "done" || frame.event === "error") close();
    });

    for (const frame of await replay(messageId)) {
      const key = `${frame.event}:${JSON.stringify(frame.data)}`;
      if (frame.event !== "token") seen.add(key);
      write(frame);
      if (frame.event === "done") close();
    }
  })();
}
