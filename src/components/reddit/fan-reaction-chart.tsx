"use client";

/**
 * Fan-reaction comment-volume chart for r/formula1's race-discussion thread.
 *
 * Renders a recharts AreaChart where each x-axis tick is one minute since
 * race start, and each y value is the number of comments posted in that
 * minute. Spikes correspond to overtakes, crashes, safety cars, or the
 * chequered flag — the moments fans react to in real time.
 *
 * Two-step fetch:
 *   1. /api/reddit/race-thread     -> resolve race name + date to a thread ID
 *   2. /api/reddit/comment-volume  -> bucket the thread's comments by minute
 *
 * Both calls are cached server-side, so re-renders within 5–10min are
 * effectively free.
 *
 * EXAMPLE_USAGE:
 *
 *   import FanReactionChart from "@/components/reddit/fan-reaction-chart";
 *
 *   // Inside a race page, once we have the race metadata:
 *   <FanReactionChart
 *     raceTitle="Monaco Grand Prix"
 *     raceStart="2025-05-25T13:00:00Z"
 *     raceEnd="2025-05-25T15:00:00Z"
 *   />
 *
 * Not yet wired into any existing page — that lands in a follow-up phase.
 */

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  raceTitle: string; // for thread search
  raceStart: string; // ISO
  raceEnd: string; // ISO
  className?: string;
}

interface ThreadMeta {
  id: string;
  title: string;
  created: number;
  permalink: string;
}

interface VolumeBin {
  minute: number;
  count: number;
}

interface VolumeResponse {
  bins: VolumeBin[];
  total: number;
  peak: { minute: number; count: number };
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "no-thread" }
  | { kind: "empty"; thread: ThreadMeta }
  | { kind: "ready"; thread: ThreadMeta; data: VolumeResponse };

const FILL_COLOR = "#9b5de5"; // muted purple — Reddit-adjacent without aping it

export default function FanReactionChart({
  raceTitle,
  raceStart,
  raceEnd,
  className,
}: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    async function load() {
      try {
        // Step 1: resolve the thread.
        const threadParams = new URLSearchParams({
          race: raceTitle,
          date: raceStart,
        });
        const tRes = await fetch(
          `/api/reddit/race-thread?${threadParams.toString()}`,
        );
        if (tRes.status === 404) {
          if (!cancelled) setState({ kind: "no-thread" });
          return;
        }
        if (!tRes.ok) throw new Error(`thread status=${tRes.status}`);
        const thread = (await tRes.json()) as ThreadMeta;

        // Step 2: bucket the comments.
        const volParams = new URLSearchParams({
          thread: thread.id,
          race_start: raceStart,
          race_end: raceEnd,
        });
        const vRes = await fetch(
          `/api/reddit/comment-volume?${volParams.toString()}`,
        );
        if (!vRes.ok) throw new Error(`volume status=${vRes.status}`);
        const data = (await vRes.json()) as VolumeResponse;

        if (cancelled) return;
        if (!data.bins || data.bins.length === 0 || data.total === 0) {
          setState({ kind: "empty", thread });
          return;
        }
        setState({ kind: "ready", thread, data });
      } catch (err) {
        if (cancelled) return;
        console.error("FanReactionChart load error:", err);
        setState({ kind: "error" });
      }
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [raceTitle, raceStart, raceEnd]);

  return (
    <div className={cn("glass-card p-4", className)}>
      <Header state={state} />
      <Body state={state} />
    </div>
  );
}

function Header({ state }: { state: LoadState }) {
  // Permalink only available once we resolve the thread — surface it as
  // a small "view on Reddit" link so curious users can dive in.
  const permalink =
    state.kind === "ready" || state.kind === "empty"
      ? state.thread.permalink
      : null;

  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4" style={{ color: FILL_COLOR }} />
        <span className="ferrari-label font-semibold">Fan Reactions · r/formula1</span>
      </div>
      {permalink && (
        <a
          href={`https://www.reddit.com${permalink}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ferrari-micro text-f1-muted hover:text-f1-red transition-colors"
          style={{ letterSpacing: "0.083em", textTransform: "uppercase" }}
        >
          View thread
        </a>
      )}
    </div>
  );
}

function Body({ state }: { state: LoadState }) {
  if (state.kind === "loading") return <ChartSkeleton />;
  if (state.kind === "error") {
    return (
      <p className="text-ferrari-caption text-f1-muted text-center py-8">
        Reactions unavailable
      </p>
    );
  }
  if (state.kind === "no-thread") {
    return (
      <p className="text-ferrari-caption text-f1-muted text-center py-8">
        No race discussion thread found
      </p>
    );
  }
  if (state.kind === "empty") {
    return (
      <p className="text-ferrari-caption text-f1-muted text-center py-8">
        No comments in race window
      </p>
    );
  }
  return <Chart data={state.data} />;
}

function ChartSkeleton() {
  return (
    <div
      className="animate-pulse rounded-ferrari bg-[rgba(255,255,255,0.04)] h-[200px] sm:h-[280px]"
      aria-hidden="true"
    />
  );
}

interface ChartDatum {
  minute: number;
  count: number;
  isPeak: boolean;
}

function Chart({ data }: { data: VolumeResponse }) {
  // Pre-compute the peak flag once so the tooltip can render in O(1)
  // without re-scanning the bins on every hover.
  const peakMinute = data.peak.minute;
  const chartData: ChartDatum[] = data.bins.map((b) => ({
    minute: b.minute,
    count: b.count,
    isPeak: b.minute === peakMinute && b.count > 0,
  }));

  // Show a tick every ~10 minutes regardless of total length so the axis
  // stays legible on mobile. recharts' "preserveStartEnd" + interval=N
  // gives us evenly-spaced labels.
  const tickInterval = Math.max(1, Math.floor(chartData.length / 6));

  return (
    <div className="w-full h-[200px] sm:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="redditFillGradient" x1="0" y1="0" x2="0" y2="1">
              {/* 25% top → softer at the bottom keeps the baseline from
                  reading as a hard horizontal stripe on dark UI. */}
              <stop offset="0%" stopColor={FILL_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={FILL_COLOR} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="minute"
            tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
            interval={tickInterval}
            tickFormatter={(m: number) => `${m}m`}
          />
          <YAxis
            tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            content={<ReactionTooltip />}
            cursor={{ stroke: "rgba(155,93,229,0.4)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={FILL_COLOR}
            strokeOpacity={0.7}
            strokeWidth={2}
            fill="url(#redditFillGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayloadEntry {
  payload?: ChartDatum;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function ReactionTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  if (!datum) return null;

  return (
    <div
      style={{
        background: "rgba(21,21,30,0.97)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "2px",
        padding: "8px 10px",
        fontSize: "12px",
        fontFamily: "Fira Code",
        backdropFilter: "blur(12px)",
        boxShadow: "rgb(153,153,153) 1px 1px 1px 0px",
      }}
    >
      <div
        style={{
          color: "#969696",
          fontSize: "10px",
          letterSpacing: "1px",
          textTransform: "uppercase",
          marginBottom: "2px",
        }}
      >
        +{datum.minute} min
      </div>
      <div style={{ color: "#fff", fontVariantNumeric: "tabular-nums" }}>
        {datum.count} comment{datum.count === 1 ? "" : "s"}
      </div>
      {datum.isPeak && (
        <div
          style={{
            color: FILL_COLOR,
            fontSize: "10px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginTop: "4px",
            fontWeight: 600,
          }}
        >
          Peak moment
        </div>
      )}
    </div>
  );
}
