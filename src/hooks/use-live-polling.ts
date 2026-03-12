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
 * Checks if there's an active F1 session happening right now.
 * Returns true if the current time is within a session window.
 */
export function useIsRaceWeekend(sessions: { date_start: string }[]): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const now = new Date();
    const active = sessions.some((s) => {
      const start = new Date(s.date_start);
      const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // +3 hours
      return now >= start && now <= end;
    });
    setIsActive(active);

    // Re-check every 60 seconds
    const timer = setInterval(() => {
      const now = new Date();
      const active = sessions.some((s) => {
        const start = new Date(s.date_start);
        const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
        return now >= start && now <= end;
      });
      setIsActive(active);
    }, 60000);

    return () => clearInterval(timer);
  }, [sessions]);

  return isActive;
}
