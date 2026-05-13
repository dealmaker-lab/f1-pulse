/**
 * GET /api/live-timing/stream?topics=TimingData,RaceControlMessages
 *
 * Server-Sent Events bridge from F1's SignalR hub to browsers.
 *
 * Architecture:
 *   browser <-- SSE -- this route <-- in-process fan-out (LiveTimingHub)
 *                                  <-- single SignalR upstream
 *
 * The hub holds ONE upstream WebSocket no matter how many browser clients
 * are connected. When the last browser disconnects, the upstream is torn
 * down — F1 doesn't like idle authenticated connections lingering and we
 * don't want to keep paying for a Vercel function instance that's doing
 * nothing.
 *
 * Caveats:
 *   - `runtime: 'nodejs'` is REQUIRED. The Edge runtime has no `ws` and
 *     no Node `Buffer`, so the SignalR client will fail to import.
 *   - Long-lived SSE on Vercel needs `dynamic: 'force-dynamic'` to opt
 *     out of caching, AND the platform's max function duration applies.
 *     On Hobby this is 10s — meaning live timing only really works on
 *     Pro/Enterprise (or self-hosted). Heartbeats give the connection
 *     the best chance of being recognised as active.
 *   - We don't authenticate this endpoint. F1's data is technically
 *     restricted, but any browser can already poll their JSON endpoints.
 *     If we want auth, gate by Clerk middleware at the route level.
 */

import { NextRequest } from "next/server";
import {
  F1SignalRClient,
  getStreamMode,
} from "@/lib/f1-livetiming/signalr-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const F1_HUB_URL = "https://livetiming.formula1.com/signalr";
const F1_HUB_NAME = "Streaming";

// Topics F1 actually publishes on the Streaming hub. We accept anything,
// but if the client asks for something not in this list we log a warning
// because it's almost certainly a typo.
const KNOWN_TOPICS = new Set([
  "Heartbeat",
  "SessionInfo",
  "ArchiveStatus",
  "TrackStatus",
  "WeatherData",
  "TimingData",
  "TimingAppData",
  "TimingStats",
  "DriverList",
  "LapCount",
  "ExtrapolatedClock",
  "RaceControlMessages",
  "PitLaneTimeCollection",
  "TeamRadio",
  "ChampionshipPrediction",
  "CarData.z",
  "Position.z",
]);

const HEARTBEAT_MS = 15_000;

type Subscriber = (topic: string, data: unknown) => void;

/**
 * In-process singleton that owns the upstream SignalR connection and
 * fans messages out to every SSE client.
 *
 * IMPORTANT: This is a module-level singleton. In a serverless deploy
 * each function instance has its own copy, which is fine — we don't
 * need cross-instance fan-out, we just don't want every SSE request
 * opening its own upstream WS in the SAME instance.
 */
class LiveTimingHub {
  private static _instance: LiveTimingHub | null = null;

  private client: F1SignalRClient | null = null;
  /** Promise of the in-flight connect, so concurrent subscribers wait on the same dial. */
  private connecting: Promise<void> | null = null;
  /** All distinct topics ever requested across live subscribers. */
  private topics = new Set<string>();
  private subscribers = new Set<Subscriber>();

  static getInstance(): LiveTimingHub {
    if (!LiveTimingHub._instance) LiveTimingHub._instance = new LiveTimingHub();
    return LiveTimingHub._instance;
  }

  /**
   * Add a subscriber. Returns an unsubscribe fn. If this is the first
   * subscriber, kicks off the upstream SignalR connection and only
   * resolves once it's open. Throws if the upstream fails to connect.
   */
  async subscribe(topics: string[], cb: Subscriber): Promise<() => void> {
    for (const t of topics) this.topics.add(t);
    this.subscribers.add(cb);

    try {
      await this.ensureConnected();
    } catch (err) {
      // Failed to dial upstream — back out our state so we don't hold
      // a phantom subscriber count.
      this.subscribers.delete(cb);
      throw err;
    }

    return () => {
      this.subscribers.delete(cb);
      this.maybeDisconnect();
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;

    // Snapshot topic list. If new subscribers add topics later we'd need
    // to re-Subscribe — F1's hub supports that, but for v1 we just use
    // whatever the first caller asked for plus whatever's been added so
    // far. New topics from later subscribers will only flow if the
    // upstream happens to push them anyway (which TimingData does).
    const topics = Array.from(this.topics);

    const client = new F1SignalRClient({
      hubUrl: F1_HUB_URL,
      hub: F1_HUB_NAME,
      topics,
      onMessage: (topic, data) => {
        // Snapshot the set so a subscriber unsubscribing during dispatch
        // doesn't mutate-during-iteration.
        for (const sub of Array.from(this.subscribers)) {
          try {
            sub(topic, data);
          } catch (err) {
            console.error("[live-timing] subscriber threw:", err);
          }
        }
      },
      onError: (err) => {
        console.error("[live-timing] upstream error:", err.message);
      },
      onClose: () => {
        console.warn("[live-timing] upstream closed");
        this.client = null;
        this.connecting = null;
      },
    });

    this.connecting = client
      .connect()
      .then(() => {
        this.client = client;
      })
      .finally(() => {
        this.connecting = null;
      });

    return this.connecting;
  }

  private maybeDisconnect(): void {
    if (this.subscribers.size > 0) return;
    if (!this.client) return;
    console.log("[live-timing] last subscriber gone — closing upstream");
    this.client.close();
    this.client = null;
    this.topics.clear();
  }
}

function parseTopics(raw: string | null): string[] {
  if (!raw) return ["TimingData", "TrackStatus", "RaceControlMessages"];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return ["TimingData"];
  for (const p of parts) {
    if (!KNOWN_TOPICS.has(p)) {
      console.warn(`[live-timing] unknown topic requested: ${p}`);
    }
  }
  return parts;
}

function sseFrame(event: string, data: unknown): string {
  // SSE escaping: each `data:` line ends at \n. JSON.stringify never emits
  // raw newlines, so we can put the whole payload on one line.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const topics = parseTopics(req.nextUrl.searchParams.get("topics"));

  const encoder = new TextEncoder();
  const hub = LiveTimingHub.getInstance();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      // We can't always know when the client has gone away in serverless
      // environments — we listen on req.signal AND defensively catch
      // controller.enqueue throwing (which it does once the consumer is
      // gone) to clean up. `cleanup` and `onAbort` reference each other,
      // so we declare both with `let` and assign before either runs.
      let cleanup = (): void => {};
      const onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        req.signal.removeEventListener("abort", onAbort);
      };
      req.signal.addEventListener("abort", onAbort);

      const safeEnqueue = (chunk: string): boolean => {
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          // Stream is closed — consumer disconnected.
          cleanup();
          return false;
        }
      };

      // Send the SSE retry hint and an initial open event. `streamMode`
      // tells the client whether the upstream is authenticated ("full") or
      // anonymous ("public") so UIs can flag when richer telemetry is
      // unavailable. The cookie value itself never leaves the server.
      safeEnqueue(`retry: 5000\n\n`);
      safeEnqueue(
        sseFrame("open", { topics, streamMode: getStreamMode() }),
      );

      try {
        unsubscribe = await hub.subscribe(topics, (topic, data) => {
          // Filter at the edge — multiple SSE clients may want different
          // subsets of the upstream stream.
          if (!topics.includes(topic)) return;
          safeEnqueue(sseFrame(topic, data));
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        safeEnqueue(sseFrame("error", { message: msg }));
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
        return;
      }

      heartbeat = setInterval(() => {
        if (!safeEnqueue(sseFrame("ping", { t: Date.now() }))) return;
      }, HEARTBEAT_MS);
    },
    cancel: () => {
      // Browser closed the EventSource. Tear down our subscription.
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering for nginx/Vercel edge.
      "X-Accel-Buffering": "no",
    },
  });
}
