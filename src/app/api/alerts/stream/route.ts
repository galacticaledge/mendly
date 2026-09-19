/**
 * The practitioner's live alert feed, over server-sent events.
 *
 * A patient who has fallen is not well served by a dashboard that updates when
 * someone reloads it. SSE is the right size of tool here: one direction, plain
 * HTTP, no second server to run.
 *
 * The database is polled every few seconds rather than listened to with
 * LISTEN/NOTIFY, because a pooled connection is not guaranteed to be the one
 * holding the listener. A few seconds of delay is acceptable for this; a missed
 * alert would not be.
 */

import { requireUser, UnauthorizedError } from "@/lib/auth/session";
import { listAlertsSince } from "@/lib/db/queries";

const POLL_MS = 3000;
/** Comment line sent periodically so proxies do not close an idle connection. */
const KEEPALIVE_MS = 25_000;

export async function GET() {
  let user;
  try {
    user = await requireUser("practitioner");
  } catch (error) {
    const status = error instanceof UnauthorizedError ? 401 : 500;
    return new Response("", { status });
  }

  const encoder = new TextEncoder();
  let since = new Date();

  // Held outside the stream callbacks so `cancel` can clear what `start` set.
  let poll: ReturnType<typeof setInterval> | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (poll) clearInterval(poll);
    if (keepalive) clearInterval(keepalive);
    poll = null;
    keepalive = null;
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The practitioner closed the tab between a poll and this write.
          stop();
        }
      };

      send("ready", { since: since.toISOString() });

      poll = setInterval(async () => {
        try {
          const alerts = await listAlertsSince(user.id, since);
          if (alerts.length > 0) {
            since = alerts[alerts.length - 1].time;
            for (const alert of alerts) send("alert", alert);
          }
        } catch (error) {
          console.error("[mendly] Alert stream poll failed:", error);
        }
      }, POLL_MS);

      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          stop();
        }
      }, KEEPALIVE_MS);
    },
    // Runs when the practitioner closes the tab or navigates away. Without it
    // both timers would keep polling the database for a reader that is gone.
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and several managed proxies buffer responses by default, which
      // holds each event until the buffer fills. This turns that off.
      "X-Accel-Buffering": "no",
    },
  });
}
