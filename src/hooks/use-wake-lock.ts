"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Screen Wake Lock — keeps the display awake during a live race so a phone
 * propped up on the desk doesn't sleep mid-session.
 *
 * Degrades silently: `supported` is false where the API is absent (e.g.
 * Safari < 16.4, non-secure contexts). Re-acquires on tab re-focus because
 * the browser releases the lock whenever the page is hidden.
 */
export function useWakeLock(): {
  supported: boolean;
  active: boolean;
  toggle: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  // Tracks intent across tab-visibility changes (the lock itself is dropped
  // when the page is hidden, but the user's "keep awake" choice persists).
  const wantLockRef = useRef(false);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  const request = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setActive(true);
      sentinel.addEventListener("release", () => {
        setActive(false);
        sentinelRef.current = null;
      });
    } catch {
      // Rejected (e.g. low battery / not focused) — leave inactive.
      setActive(false);
    }
  }, []);

  const release = useCallback(async () => {
    wantLockRef.current = false;
    try {
      await sentinelRef.current?.release();
    } catch {
      /* already released */
    }
    sentinelRef.current = null;
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    if (active || wantLockRef.current) {
      release();
    } else {
      wantLockRef.current = true;
      request();
    }
  }, [active, request, release]);

  // Re-acquire when the tab becomes visible again if the user still wants it.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && wantLockRef.current && !sentinelRef.current) {
        request();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [request]);

  return { supported, active, toggle };
}
