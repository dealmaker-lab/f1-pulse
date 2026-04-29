"use client";

import { useState, useRef } from "react";
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

  const { data, loading } = useLivePolling<RaceControlMessage[]>({
    url: sessionKey
      ? `https://api.openf1.org/v1/race_control?session_key=${sessionKey}`
      : "",
    interval: RACE_CONTROL_POLL_MS,
    enabled: !!sessionKey,
  });

  // OpenF1 returns oldest-first; reverse for newest-first display.
  const messages = Array.isArray(data) ? [...data].reverse() : [];

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
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--f1-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-f1-red" />
          <span className="ferrari-label font-semibold">
            Race Control
          </span>
          <span className="text-ferrari-micro font-mono text-f1-muted bg-[var(--f1-hover)] px-1.5 py-0.5 rounded-ferrari">
            {messages.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-f1-muted" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-f1-muted" />
        )}
      </button>

      {/* Messages list */}
      {expanded && (
        <div
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
