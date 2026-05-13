"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useLivePolling } from "@/hooks/use-live-polling";
import {
  Flag,
  AlertTriangle,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
  Radio,
} from "lucide-react";

/** localStorage key for the broadcast-delay slider. Stable across sessions. */
const DELAY_STORAGE_KEY = "f1-pulse:rc-delay-sec";
/** Slider bounds. F1 international broadcasts run ~30–90s behind live timing. */
const DELAY_MIN = 0;
const DELAY_MAX = 120;
const DELAY_STEP = 5;

interface RaceControlMessage {
  date: string;
  lap_number: number | null;
  category: string;
  flag: string | null;
  message: string;
  scope: string | null;
  driver_number: number | null;
}

interface Props {
  sessionKey: number;
  className?: string;
}

// Color coding by message type (matching F1 TV conventions)
const CATEGORY_COLORS: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }
> = {
  Flag: {
    bg: "rgba(255,201,6,0.08)",
    text: "#FFC906",
    border: "rgba(255,201,6,0.2)",
    icon: Flag,
  },
  SafetyCar: {
    bg: "rgba(255,128,0,0.08)",
    text: "#FF8000",
    border: "rgba(255,128,0,0.2)",
    icon: Shield,
  },
  Drs: {
    bg: "rgba(57,181,74,0.08)",
    text: "#39B54A",
    border: "rgba(57,181,74,0.2)",
    icon: Zap,
  },
  Other: {
    bg: "rgba(225,6,0,0.06)",
    text: "#e10600",
    border: "rgba(225,6,0,0.15)",
    icon: Radio,
  },
};

const RED_FLAG_STYLE = {
  bg: "rgba(225,6,0,0.1)",
  text: "#e10600",
  border: "rgba(225,6,0,0.3)",
  icon: AlertTriangle,
};

function getCategoryStyle(category: string, flag: string | null) {
  // Flags take priority over category — a YELLOW under SafetyCar is still
  // a yellow flag visually, but RED supersedes everything.
  if (flag === "RED") return RED_FLAG_STYLE;
  if (flag === "YELLOW" || flag === "DOUBLE YELLOW") return CATEGORY_COLORS.Flag;
  if (category === "SafetyCar" || category === "Vsc") return CATEGORY_COLORS.SafetyCar;
  if (category === "Drs") return CATEGORY_COLORS.Drs;
  return CATEGORY_COLORS.Other;
}

// Race control is the most time-critical "live" surface — flags and SC
// deployments need to surface within seconds. Poll at 5s while session is
// open; useLivePolling skips state updates when payload is unchanged.
const RACE_CONTROL_POLL_MS = 5_000;

export default function RaceControlFeed({ sessionKey, className }: Props) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Broadcast-delay slider. F1 live timing is wire-feed and runs ahead of
  // the TV picture by ~30–90s (F1 TV Pro), 60–120s (F1 TV Access), or
  // wildly more on terrestrial channels. Users can dial in their delay so
  // the race-control feed matches what they're seeing on screen.
  //
  // SSR-safe: initialise to 0 and hydrate from localStorage in an effect.
  // Otherwise the server-rendered HTML would mismatch the first client
  // render, tripping React's hydration mismatch warning.
  const [delaySec, setDelaySec] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(DELAY_STORAGE_KEY);
      if (stored === null) return;
      const parsed = Number.parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed >= DELAY_MIN && parsed <= DELAY_MAX) {
        setDelaySec(parsed);
      }
    } catch {
      // Private mode / disabled storage — silently keep the default.
    }
  }, []);
  // Persist on change. We also clamp here as a belt-and-braces against
  // any path that bypasses the slider's min/max attributes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const clamped = Math.max(DELAY_MIN, Math.min(DELAY_MAX, delaySec));
      window.localStorage.setItem(DELAY_STORAGE_KEY, String(clamped));
    } catch {
      /* ignore — non-fatal */
    }
  }, [delaySec]);

  // Re-tick once per second when a delay is set so the visibility cutoff
  // advances even when no new messages have arrived. With delay=0 this is
  // pointless work, so we only schedule the timer when the user has dialed
  // in some delay.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (delaySec === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [delaySec]);

  // Route through our /api/f1/race-control proxy rather than hitting OpenF1
  // directly — keeps session_key validation, error sanitization, and any
  // future caching server-side.
  const { data, loading } = useLivePolling<RaceControlMessage[]>({
    url: sessionKey
      ? `/api/f1/race-control?session_key=${sessionKey}`
      : "",
    interval: RACE_CONTROL_POLL_MS,
    enabled: !!sessionKey,
  });

  // OpenF1 returns oldest-first; reverse for newest-first display, then
  // apply the broadcast-delay filter. Messages whose timestamp is newer
  // than (now - delay) are hidden so the feed lines up with TV.
  const cutoff = now - delaySec * 1000;
  const messages = (Array.isArray(data) ? [...data].reverse() : []).filter(
    (msg) => {
      if (delaySec === 0) return true;
      if (!msg.date) return true;
      const ts = new Date(msg.date).getTime();
      if (!Number.isFinite(ts)) return true;
      return ts <= cutoff;
    },
  );

  if (loading) {
    return (
      <div className={cn("glass-card p-4", className)}>
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-f1-red" />
          <span className="ferrari-label font-semibold">
            Race Control
          </span>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-4 h-4 border-2 border-f1-red/30 border-t-f1-red rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn("glass-card p-4", className)}>
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-f1-muted" />
          <span className="ferrari-label font-semibold text-f1-muted">
            Race Control
          </span>
        </div>
        <p className="text-ferrari-caption text-f1-muted text-center py-4">
          No race control messages for this session
        </p>
      </div>
    );
  }

  return (
    <div className={cn("glass-card overflow-hidden", className)}>
      {/* Header. The expand toggle and the delay slider are sibling
          interactive controls — we deliberately AVOID nesting the slider
          inside the toggle <button>, because nested interactives break
          keyboard focus, click bubbling, and screen reader semantics. */}
      <div className="w-full flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="race-control-feed-list"
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <Radio className="w-4 h-4 text-f1-red" />
          <span className="ferrari-label font-semibold">Race Control</span>
          <span className="text-ferrari-micro font-mono text-f1-muted bg-[var(--f1-hover)] px-1.5 py-0.5 rounded-ferrari">
            {messages.length}
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-f1-muted" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-f1-muted" />
          )}
        </button>

        {/* Broadcast delay slider. ≥44px tall hit area on mobile via the
            wrapper's `min-h-[44px]` and the input's `h-11 sm:h-2` — the
            visible track is thin on desktop but the touch surface stays
            tall on small screens. */}
        <label
          className="flex items-center gap-2 min-h-[44px] sm:min-h-0"
          title="Delay the displayed timing so it matches your TV broadcast"
        >
          <span className="text-ferrari-micro font-mono text-f1-muted whitespace-nowrap">
            Delay: {delaySec}s
          </span>
          <input
            type="range"
            min={DELAY_MIN}
            max={DELAY_MAX}
            step={DELAY_STEP}
            value={delaySec}
            onChange={(e) => setDelaySec(Number.parseInt(e.target.value, 10))}
            aria-label={`Broadcast delay in seconds, currently ${delaySec}`}
            className="w-20 sm:w-24 h-11 sm:h-2 accent-f1-red cursor-pointer"
          />
        </label>
      </div>

      {/* Messages list */}
      {expanded && (
        <div
          id="race-control-feed-list"
          ref={scrollRef}
          className="max-h-[300px] overflow-y-auto px-3 pb-3 space-y-1.5"
        >
          {messages.map((msg) => {
            const style = getCategoryStyle(msg.category, msg.flag);
            const Icon = style.icon;
            const time = msg.date
              ? new Date(msg.date).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "";
            // Stable key: date+message resists reordering when polling prepends.
            const key = `${msg.date}-${msg.message}`;

            return (
              <div
                key={key}
                className="flex items-start gap-2 px-2.5 py-2 rounded-ferrari-dialog transition-all duration-300"
                style={{
                  backgroundColor: style.bg,
                  borderLeft: `2px solid ${style.border}`,
                }}
              >
                <Icon
                  className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                  style={{ color: style.text }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {msg.lap_number && (
                      <span
                        className="text-[9px] font-mono font-bold"
                        style={{ color: style.text }}
                      >
                        LAP {msg.lap_number}
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-f1-muted">
                      {time}
                    </span>
                    {msg.flag && (
                      <span
                        className="text-[8px] font-mono font-bold px-1 py-0.5 rounded"
                        style={{
                          backgroundColor: style.border,
                          color: style.text,
                        }}
                      >
                        {msg.flag}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-f1-sub leading-relaxed">
                    {msg.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
