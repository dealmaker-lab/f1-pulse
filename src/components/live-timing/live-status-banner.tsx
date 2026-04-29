"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Flag, AlertTriangle, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveTiming } from "@/hooks/use-live-timing";

/**
 * Compact banner that shows live-timing status when an F1 session is
 * actively pushing data. Renders nothing when not connected.
 *
 * Pulls three topics from the SignalR proxy:
 *   - TrackStatus       → flag state (Green/Yellow/Red/SC/VSC)
 *   - RaceControlMessages → most recent stewards message (truncated)
 *   - TimingData        → counted as proxy for "stuff is happening"
 *
 * EXAMPLE USAGE:
 * ```tsx
 * import { LiveStatusBanner } from "@/components/live-timing/live-status-banner";
 *
 * export default function RaceLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <>
 *       <LiveStatusBanner />
 *       {children}
 *     </>
 *   );
 * }
 * ```
 *
 * Notes:
 *  - The component does its own subscription. If multiple banners mount
 *    they will share the SAME upstream SignalR connection (the SSE route
 *    fans out), but each will hold its own EventSource — fine for now.
 *  - Schema is pulled defensively. F1 has shipped breaking changes to
 *    the TrackStatus shape mid-season before, so every read is guarded.
 */

const TOPICS = ["TrackStatus", "RaceControlMessages", "TimingData"];

// F1 TrackStatus.Status codes (as documented by fastf1 / F1TimingClient):
//   1 = AllClear (Green), 2 = Yellow, 4 = SC, 5 = Red, 6 = VSC, 7 = VSC Ending
type StatusKey = "Green" | "Yellow" | "Red" | "SC" | "VSC" | "Unknown";

const STATUS_LABEL: Record<StatusKey, string> = {
  Green: "Green Flag",
  Yellow: "Yellow Flag",
  Red: "Red Flag",
  SC: "Safety Car",
  VSC: "Virtual Safety Car",
  Unknown: "Track Status",
};

const STATUS_STYLE: Record<
  StatusKey,
  {
    chip: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  Green: {
    chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    icon: Flag,
  },
  Yellow: {
    chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    icon: AlertTriangle,
  },
  Red: {
    chip: "bg-red-500/15 text-red-300 ring-red-500/30",
    icon: Flag,
  },
  SC: {
    chip: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
    icon: Shield,
  },
  VSC: {
    chip: "bg-yellow-500/15 text-yellow-300 ring-yellow-500/30",
    icon: Zap,
  },
  Unknown: {
    chip: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
    icon: Flag,
  },
};

function deriveStatus(payload: unknown): StatusKey {
  if (!payload || typeof payload !== "object") return "Unknown";
  // F1 ships either a `Status` numeric code or a `Message` string —
  // sometimes both, sometimes just one. Check both.
  const obj = payload as { Status?: unknown; Message?: unknown };
  const code = typeof obj.Status === "string" ? Number(obj.Status) : obj.Status;
  if (typeof code === "number") {
    if (code === 1) return "Green";
    if (code === 2) return "Yellow";
    if (code === 4) return "SC";
    if (code === 5) return "Red";
    if (code === 6 || code === 7) return "VSC";
  }
  const msg = typeof obj.Message === "string" ? obj.Message.toLowerCase() : "";
  if (msg.includes("vsc") || msg.includes("virtual safety")) return "VSC";
  if (msg.includes("safety car")) return "SC";
  if (msg.includes("red")) return "Red";
  if (msg.includes("yellow")) return "Yellow";
  if (msg.includes("clear") || msg.includes("green")) return "Green";
  return "Unknown";
}

interface RaceControlEntry {
  Message?: string;
  Utc?: string;
  Lap?: number;
}

function deriveLatestRC(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  // F1's RaceControlMessages comes in two shapes — the bulk snapshot has
  // `Messages` as an object keyed by index, while incremental updates
  // hand us a partial object. Walk both possibilities and pick the
  // entry with the latest Utc.
  const obj = payload as {
    Messages?: Record<string, RaceControlEntry> | RaceControlEntry[];
  };
  const messages = obj.Messages;
  if (!messages) {
    // Maybe the payload IS a single message (incremental).
    const single = payload as RaceControlEntry;
    return single.Message?.trim() ?? null;
  }
  const entries: RaceControlEntry[] = Array.isArray(messages)
    ? messages
    : Object.values(messages);
  if (entries.length === 0) return null;
  const latest = entries.reduce<RaceControlEntry | null>((best, curr) => {
    if (!best) return curr;
    const a = best.Utc ?? "";
    const b = curr.Utc ?? "";
    return b > a ? curr : best;
  }, null);
  return latest?.Message?.trim() ?? null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

interface LiveStatusBannerProps {
  className?: string;
}

export function LiveStatusBanner({ className }: LiveStatusBannerProps) {
  const { messages, connected } = useLiveTiming(TOPICS);

  // Count TimingData messages received as a "stuff is happening" proxy.
  // We bump on every new reference from the hook, which only changes
  // when a new payload actually arrives.
  const [msgCount, setMsgCount] = useState(0);
  const lastTimingRef = useRef<unknown>(null);

  useEffect(() => {
    const t = messages.TimingData;
    if (t && t !== lastTimingRef.current) {
      lastTimingRef.current = t;
      setMsgCount((n) => n + 1);
    }
  }, [messages.TimingData]);

  if (!connected) return null;

  const status = deriveStatus(messages.TrackStatus);
  const latestRC = deriveLatestRC(messages.RaceControlMessages);
  const styleSet = STATUS_STYLE[status];
  const StatusIcon = styleSet.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-sm shadow-lg backdrop-blur",
        className,
      )}
    >
      {/* Live indicator */}
      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-red-400 ring-1 ring-red-500/40">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <Radio className="h-3 w-3" aria-hidden />
        LIVE TIMING
      </span>

      {/* Track status chip */}
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1",
          styleSet.chip,
        )}
      >
        <StatusIcon className="h-3 w-3" aria-hidden />
        {STATUS_LABEL[status]}
      </span>

      {/* Latest race control message */}
      {latestRC && (
        <span
          className="min-w-0 flex-1 truncate text-xs text-zinc-300"
          title={latestRC}
        >
          {truncate(latestRC, 110)}
        </span>
      )}

      {/* Message counter */}
      <span className="ml-auto whitespace-nowrap text-[11px] tabular-nums text-zinc-500">
        ({msgCount} msg{msgCount === 1 ? "" : "s"})
      </span>
    </div>
  );
}
