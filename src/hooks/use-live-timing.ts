"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Subscribe to live-timing topics from `/api/live-timing/stream`.
 *
 * Returns the most recent message PER TOPIC — not a buffer. Components
 * that need history should keep their own ring buffer in a useEffect.
 *
 * Reconnection: EventSource auto-reconnects on transport errors, but if
 * the server explicitly closes the stream (which happens when the
 * upstream SignalR drops) the browser won't re-dial automatically. We
 * implement an exponential-backoff reconnect on top: 1s, 2s, 4s, 8s,
 * capped at 30s, jittered ±25%. Reset on a successful `open` event.
 *
 * Example:
 * ```tsx
 * const { messages, connected, error } = useLiveTiming([
 *   "TimingData",
 *   "RaceControlMessages",
 * ]);
 *
 * const timing = messages.TimingData;        // unknown — type-narrow yourself
 * const lastRC = messages.RaceControlMessages;
 * ```
 */
export interface UseLiveTimingResult {
  /** Map of topic name → latest data payload received. `unknown` because F1's schema isn't typed. */
  messages: Record<string, unknown>;
  /** True between an `open` event and the next disconnect/error. */
  connected: boolean;
  /** Last error message surfaced by the stream. Cleared when we reconnect. */
  error: string | null;
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export function useLiveTiming(topics: string[]): UseLiveTimingResult {
  // Stable key for the topic set — order-insensitive. Lets us skip
  // re-creating the EventSource when callers pass `['A','B']` vs `['B','A']`.
  const topicsKey = [...topics].sort().join(",");

  const [messages, setMessages] = useState<Record<string, unknown>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We need stable refs across reconnect attempts.
  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!topicsKey) return;

    cancelledRef.current = false;
    backoffRef.current = INITIAL_BACKOFF_MS;

    const connect = () => {
      if (cancelledRef.current) return;

      const url = `/api/live-timing/stream?topics=${encodeURIComponent(topicsKey)}`;
      let es: EventSource;
      try {
        es = new EventSource(url);
      } catch (err) {
        // EventSource constructor itself rarely throws, but be defensive.
        setError((err as Error).message ?? "EventSource failed to construct");
        scheduleReconnect();
        return;
      }
      esRef.current = es;

      // Both the native transport `open` and the server-sent `open`
      // event share the same name and fire this listener. The native one
      // is a bare Event; the server-sent one is a MessageEvent with our
      // echoed topic list. Either is sufficient evidence we're connected.
      // We reset backoff only on the server-sent variant — that proves
      // the server actually accepted us, not just the TCP/TLS layer.
      es.addEventListener("open", (ev) => {
        if ("data" in (ev as MessageEvent)) {
          backoffRef.current = INITIAL_BACKOFF_MS;
        }
        setConnected(true);
        setError(null);
      });

      // Server-sent "error" — distinct from EventSource's transport `error`.
      es.addEventListener("error", (ev) => {
        // Native transport error: EventSource will set readyState=CLOSED
        // for us if it's fatal. Non-fatal → readyState=CONNECTING and
        // it'll retry on its own.
        const isMessage = "data" in (ev as MessageEvent);
        if (isMessage) {
          try {
            const parsed = JSON.parse((ev as MessageEvent).data as string);
            setError(parsed?.message ?? "stream error");
          } catch {
            setError("stream error");
          }
        }
        setConnected(false);

        if (es.readyState === EventSource.CLOSED) {
          // Browser gave up — we take over.
          es.close();
          if (esRef.current === es) esRef.current = null;
          scheduleReconnect();
        }
      });

      // Heartbeat — purely to prove the upstream is alive. We don't
      // surface ping data, but we DO clear any lingering error since
      // pings only arrive on a healthy connection. Use the functional
      // form so we don't capture a stale `error` from this render.
      es.addEventListener("ping", () => {
        setError((prev) => (prev ? null : prev));
      });

      // Topic events. Rather than addEventListener for every known topic
      // (which we'd have to keep in sync with the server) we use a
      // generic onmessage handler — but EventSource only routes to
      // onmessage when the server omits `event:`. We DO send `event:`,
      // so we have to register listeners per topic.
      for (const topic of topicsKey.split(",")) {
        es.addEventListener(topic, (ev) => {
          const msg = ev as MessageEvent;
          let payload: unknown;
          try {
            payload = JSON.parse(msg.data as string);
          } catch {
            payload = msg.data;
          }
          setMessages((prev) => ({ ...prev, [topic]: payload }));
        });
      }
    };

    const scheduleReconnect = () => {
      if (cancelledRef.current) return;
      const base = backoffRef.current;
      const jitter = base * (0.75 + Math.random() * 0.5); // ±25%
      backoffRef.current = Math.min(base * 2, MAX_BACKOFF_MS);
      reconnectTimerRef.current = setTimeout(connect, jitter);
    };

    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setConnected(false);
    };
    // We deliberately depend on the joined key, not the array reference,
    // so consumers passing inline literals don't churn the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsKey]);

  return { messages, connected, error };
}
