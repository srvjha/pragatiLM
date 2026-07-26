import type { Request, Response } from "express";
import { createSubscriber } from "@/lib/events";
import { childLogger } from "@/lib/logger";

const log = childLogger("sse");

/**
 * One SSE relay, used by the source status stream. The API never generates these
 * frames, it forwards what the worker published, which is what keeps model work
 * out of the request handler.
 */
export function openSseStream(req: Request, res: Response, channel: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Without this, a reverse proxy will happily sit on the stream and buffer it.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  send(res, "ready", { channel });

  const subscriber = createSubscriber();

  void subscriber.subscribe(channel).catch((error: unknown) => {
    log.error({ err: error, channel }, "could not subscribe");
    send(res, "error", { message: "Could not subscribe to updates" });
    res.end();
  });

  subscriber.on("message", (_channel, payload) => {
    // Already JSON on the wire, so it is forwarded verbatim rather than parsed
    // and re-serialised.
    res.write(`event: message\ndata: ${payload}\n\n`);
  });

  // Proxies and browsers drop a stream that goes quiet. A comment line keeps it
  // open without being delivered as an event.
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);

  const close = () => {
    clearInterval(heartbeat);
    void subscriber.quit().catch(() => undefined);
  };

  req.on("close", close);
  res.on("close", close);
}

export function send(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
