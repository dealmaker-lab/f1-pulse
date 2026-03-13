"use client";

import { useState, useEffect } from "react";
import { Lock, Radio, Clock, Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const POST_RACE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes after race ends

interface SessionInfo {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  circuit_short_name: string;
  country_name: string;
  year: number;
}

async function fetchLiveSession(): Promise<{
  isLive: boolean;
  inPostRaceWindow: boolean;
  session: SessionInfo | null;
  nextRace: SessionInfo | null;
}> {
  try {
    // Check for active race sessions (Race only, not practice/quali)
    const liveRes = await fetch(
      "https://api.openf1.org/v1/sessions?session_type=Race&year=2025",
      { cache: "no-store" }
    );
    const sessions: SessionInfo[] = await liveRes.json();

    if (!sessions.length) {
      return { isLive: false, inPostRaceWindow: false, session: null, nextRace: null };
    }

    const now = Date.now();

    // Find any currently live race
    for (const s of sessions) {
      const start = new Date(s.date_start).getTime();
      const end = new Date(s.date_end).getTime();

      if (now >= start && now <= end) {
        return { isLive: true, inPostRaceWindow: false, session: s, nextRace: null };
      }

      // Post-race window: race ended but within 30 min
      if (now > end && now <= end + POST_RACE_WINDOW_MS) {
        return { isLive: false, inPostRaceWindow: true, session: s, nextRace: null };
      }
    }

    // Find next upcoming race
    const upcoming = sessions
      .filter((s) => new Date(s.date_start).getTime() > now)
      .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

    return {
      isLive: false,
      inPostRaceWindow: false,
      session: null,
      nextRace: upcoming[0] || null,
    };
  } catch {
    // If API fails, default to locked
    return { isLive: false, inPostRaceWindow: false, session: null, nextRace: null };
  }
}

function formatCountdown(targetDate: string): string {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return "Starting soon";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function RaceDayGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<{
    isLive: boolean;
    inPostRaceWindow: boolean;
    session: SessionInfo | null;
    nextRace: SessionInfo | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    fetchLiveSession().then((result) => {
      setStatus(result);
      setLoading(false);
    });
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (!status?.nextRace) return;
    const update = () => setCountdown(formatCountdown(status.nextRace!.date_start));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [status?.nextRace]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-racing-red" />
      </div>
    );
  }

  // Allow access during live race or post-race window
  if (status?.isLive || status?.inPostRaceWindow) {
    return <>{children}</>;
  }

  // Locked state — show a slick gate page
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen p-6">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Lock icon with pulse ring */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-racing-red/10 animate-ping" />
          <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-[var(--f1-hover)] border border-[var(--f1-border)]">
            <Lock className="w-10 h-10 text-racing-red" />
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-3xl font-black text-f1 uppercase tracking-wider"
            style={{ fontFamily: "Titillium Web, sans-serif" }}>
            Race Replay
          </h1>
          <p className="mt-2 text-f1-sub text-sm">
            Available during live race sessions only
          </p>
        </div>

        {/* Explanation card */}
        <div className="glass-card p-6 space-y-4 text-left">
          <div className="flex items-start gap-3">
            <Radio className="w-5 h-5 text-racing-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-f1 text-sm font-semibold">Live Race Tracking</p>
              <p className="text-f1-muted text-xs mt-1">
                Real-time car positions, pit strategies, and weather data streamed
                directly from the OpenF1 feed during race sessions.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-racing-amber flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-f1 text-sm font-semibold">Post-Race Access</p>
              <p className="text-f1-muted text-xs mt-1">
                Replay stays available for 30 minutes after the chequered flag
                so you can review key moments.
              </p>
            </div>
          </div>
        </div>

        {/* Next race countdown */}
        {status?.nextRace && (
          <div className="glass-card p-5">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-racing-red" />
              <span className="text-xs text-f1-muted uppercase tracking-widest font-bold">
                Next Race
              </span>
            </div>

            <p className="text-f1 text-lg font-bold">
              {status.nextRace.circuit_short_name}
            </p>
            <p className="text-f1-sub text-sm">
              {status.nextRace.country_name}
            </p>

            <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-racing-red/10 border border-racing-red/20">
              <span className="w-1.5 h-1.5 rounded-full bg-racing-red animate-pulse" />
              <span className="text-racing-red text-sm font-bold font-mono">
                {countdown}
              </span>
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-f1-muted text-xs">
          Explore other pages while you wait — Telemetry, Strategy, and H2H are always available.
        </p>
      </div>
    </div>
  );
}
