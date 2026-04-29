"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface PollingOptions {
  url: string;
  interval?: number;       // ms, default 10000 (10s)
  enabled?: boolean;       // default true
  onData?: (data: any) => void;
}

/**
 * Cheap signature for change detection — avoids deep equality.
 * Uses array length + last item's `date` for time-series payloads,
 * falls back to JSON length for everything else.
 */
function signature(json: unknown): string {
  if (Array.isArray(json)) {
    if (json.length === 0) return "0";
    const last = json[json.length - 1] as Record<string, unknown> | undefined;
    return `${json.length}:${last?.date ?? last?.timestamp ?? ""}`;
  }
  return JSON.stringify(json)?.length.toString() ?? "0";
}

/**
 * Custom hook for live polling during race weekends.
 * Automatically polls the given URL at the specified interval.
 * Returns { data, loading, error, lastUpdated, isLive, refresh }
 */
export function useLivePolling<T = any>({ url, interval = 10000, enabled = true, onData }: PollingOptions) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  // Stash onData in a ref so an inline lambda from the parent doesn't
  // re-create fetchData (which would tear down the polling interval).
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  // Track last response signature for change detection — skip setData
  // and skip onData when the payload is identical.
  const lastSigRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!mountedRef.current) return;

      const sig = signature(json);
      const changed = sig !== lastSigRef.current;
      lastSigRef.current = sig;

      setError(null);
      setLastUpdated(new Date());
      setIsLive(true);

      if (changed) {
        setData(json);
        onDataRef.current?.(json);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message);
        setIsLive(false);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url]);

  // Reset signature when url changes so first fetch always commits state.
  useEffect(() => {
    lastSigRef.current = null;
  }, [url]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      setLoading(true);
      fetchData();
    }
    return () => { mountedRef.current = false; };
  }, [url, enabled, fetchData]);

  // Polling
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(fetchData, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, interval, fetchData]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { data, loading, error, lastUpdated, isLive, refresh };
}

/**
 * Returns appropriate polling interval based on session type and whether live.
 * Race day: 3s (sub-second feel), Practice/Qualifying: 10s, No session: 60s
 */
export function getAdaptiveInterval(
  sessionType?: string,
  isLive?: boolean,
): number {
  if (!isLive) return 60_000; // 60s calendar check
  switch (sessionType) {
    case "Race":
    case "Sprint":
      return 3_000; // 3s during races
    case "Qualifying":
    case "Sprint Qualifying":
      return 5_000; // 5s during qualifying
    case "Practice 1":
    case "Practice 2":
    case "Practice 3":
      return 10_000; // 10s during practice
    default:
      return 10_000;
  }
}

/**
 * Checks if we're in an active F1 race weekend.
 * Accepts ALL session types (FP1, FP2, FP3, Quali, Sprint, Race).
 * Returns true if:
 *   - A session is currently running (within start..start+3h window), OR
 *   - We're in a race weekend (any session within ±12h of now)
 */
export function useIsRaceWeekend(sessions: { date_start: string }[]): boolean {
  const [isActive, setIsActive] = useState(false);
  // Pre-parse session start timestamps once per sessions change — saves
  // re-parsing every 30s for 100+ sessions × every consumer of this hook.
  const starts = useMemo(
    () => sessions.map((s) => new Date(s.date_start).getTime()),
    [sessions],
  );

  useEffect(() => {
    const RACE_WINDOW_MS = 3 * 60 * 60 * 1000;
    const WEEKEND_WINDOW_MS = 12 * 60 * 60 * 1000;

    const check = () => {
      const now = Date.now();
      let active = false;
      for (const start of starts) {
        // Active right now (within session window)
        if (now >= start && now <= start + RACE_WINDOW_MS) { active = true; break; }
        // Or within ±12h of any session
        if (Math.abs(now - start) < WEEKEND_WINDOW_MS) { active = true; break; }
      }
      setIsActive((prev) => (prev === active ? prev : active));
    };

    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [starts]);

  return isActive;
}
