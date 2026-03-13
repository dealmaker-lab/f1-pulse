"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface PollingOptions {
  url: string;
  interval?: number;       // ms, default 10000 (10s)
  enabled?: boolean;       // default true
  onData?: (data: any) => void;
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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (mountedRef.current) {
        setData(json);
        setError(null);
        setLastUpdated(new Date());
        setIsLive(true);
        onData?.(json);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message);
        setIsLive(false);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, onData]);

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
 * Checks if we're in an active F1 race weekend.
 * Accepts ALL session types (FP1, FP2, FP3, Quali, Sprint, Race).
 * Returns true if:
 *   - A session is currently running (within start..start+3h window), OR
 *   - We're in a race weekend (any session within ±12h of now)
 */
export function useIsRaceWeekend(sessions: { date_start: string }[]): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      // Check if a session is actively running
      const liveNow = sessions.some((s) => {
        const start = new Date(s.date_start);
        const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
        return now >= start && now <= end;
      });
      if (liveNow) { setIsActive(true); return; }
      // Check if we're in a race weekend window (±12h from any session)
      const nearSession = sessions.some((s) => {
        const start = new Date(s.date_start);
        const diff = Math.abs(now.getTime() - start.getTime());
        return diff < 12 * 60 * 60 * 1000;
      });
      setIsActive(nearSession);
    };

    check();
    const timer = setInterval(check, 30000); // re-check every 30s
    return () => clearInterval(timer);
  }, [sessions]);

  return isActive;
}
