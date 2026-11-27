import { NextRequest } from "next/server";
import { limitOr429, jsonErr } from "@/lib/api-guard";
import { subscribe, clientCount, getStatus, requestTick, type LiveEvent } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * GET /api/live/stream — Server-Sent Events channel.
 *
 * The browser opens one long-lived connection; the live engine pushes
 * `case:new` / `case:update` / `status` events the moment upstream data
 * changes, plus a heartbeat every 25s. No polling storms, instant updates.
 */
export async function GET(request: NextRequest) {
  const limited = limitOr429(request, "live-stream", 30);
  if (limited) return limited;

  // a visitor arriving nudges an immediate upstream check (throttled)
  requestTick();

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: LiveEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      send({ type: "hello", at: new Date().toISOString(), data: getStatus() });
      unsubscribe = subscribe(send);
      heartbeat = setInterval(() => {
        send({ type: "heartbeat", at: new Date().toISOString(), data: { clients: clientCount() } });
      }, 25_000);

      request.signal.addEventListener("abort", cleanup);
      // hard cap: browsers reconnect automatically (EventSource retries)
      setTimeout(cleanup, 10 * 60_000);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
