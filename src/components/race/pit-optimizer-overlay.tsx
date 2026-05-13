"use client";

/**
 * Pit-strategy optimizer visualization.
 *
 * Renders the top-N strategies returned by /api/fastf1/pit-optimize as
 * horizontal "lap timeline" bars. Each bar is one strategy; segments are
 * coloured by tyre compound; tick marks indicate the pit lap(s).
 *
 * The rank-1 (optimal) strategy gets a glowing red ring so it pops.
 *
 * Loading / error / "no data" states are mobile-friendly and
 * Ferrari-themed (matches the rest of /race-analysis).
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Wrench,
  Trophy,
  Flag,
  Clock,
} from "lucide-react";
import {
  fetchPitOptimization,
  PitOptimizerError,
  type OptimizerResult,
  type OptimizerStrategy,
} from "@/lib/pit-optimizer-client";
import { cn, formatLapTime, getTireColor } from "@/lib/utils";

export interface PitOptimizerOverlayProps {
  year: number;
  round: number;
  /** 3-letter driver code (e.g. "VER") */
  driverCode: string;
  /** Race or Sprint — defaults to "R" */
  session?: "R" | "S";
  /** Max stops to consider (1..3) — defaults to 2 */
  maxStops?: number;
  className?: string;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; firstRequest: boolean }
  | { kind: "ready"; data: OptimizerResult }
  | { kind: "error"; status: number; message: string };

// ── Component ────────────────────────────────────────────────────────────

export default function PitOptimizerOverlay({
  year,
  round,
  driverCode,
  session = "R",
  maxStops = 2,
  className,
}: PitOptimizerOverlayProps) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!driverCode) {
      setState({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    let firstRequest = true;
    setState((prev) => {
      // If we were already loading this driver, keep firstRequest=false
      firstRequest = prev.kind !== "ready" && prev.kind !== "error";
      return { kind: "loading", firstRequest };
    });

    fetchPitOptimization({
      year,
      round,
      session,
      driver: driverCode,
      strategies: maxStops,
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ kind: "ready", data });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof PitOptimizerError) {
          setState({ kind: "error", status: err.status, message: err.message });
        } else if (err instanceof Error && err.name !== "AbortError") {
          setState({ kind: "error", status: 0, message: err.message });
        }
      });

    return () => controller.abort();
  }, [year, round, session, driverCode, maxStops]);

  // ── No driver selected ──
  if (!driverCode) {
    return (
      <EmptyCard
        title="Select a driver to optimize"
        subtitle="Pick a driver from the list to compute the best pit strategy."
        className={className}
      />
    );
  }

  // ── Loading ──
  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div
        className={cn(
          "glass-card p-8 sm:p-12 rounded-xl flex flex-col items-center gap-3 text-center",
          className,
        )}
      >
        <Loader2 className="w-6 h-6 text-racing-red animate-spin" />
        <div className="text-sm text-f1 font-mono">
          Computing strategies for {driverCode}…
        </div>
        {state.kind === "loading" && state.firstRequest && (
          <div className="text-[11px] text-f1-muted font-mono max-w-sm">
            Searching every viable pit-window combination — first request
            warms up the FastF1 archive (5–10s).
          </div>
        )}
      </div>
    );
  }

  // ── Error / session-not-available ──
  if (state.kind === "error") {
    // 404 from the sidecar = "race hasn't happened or no clean laps yet".
    // Surface as a soft empty state, not a red error block.
    if (state.status === 404) {
      return (
        <EmptyCard
          title="No race data available"
          subtitle={state.message}
          className={className}
        />
      );
    }
    return (
      <div
        className={cn(
          "glass-card p-6 sm:p-8 rounded-xl border border-racing-red/40 flex flex-col items-center gap-3 text-center",
          className,
        )}
      >
        <AlertTriangle className="w-7 h-7 text-racing-red" />
        <div className="text-sm font-mono text-racing-red">
          Couldn&apos;t compute strategies
        </div>
        <div className="text-[11px] text-f1-muted font-mono max-w-md break-words">
          {state.message}
        </div>
      </div>
    );
  }

  // ── Ready ──
  return <ReadyView data={state.data} className={className} />;
}

// ── Subcomponents ────────────────────────────────────────────────────────

function EmptyCard({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-card p-8 sm:p-12 rounded-xl flex flex-col items-center gap-3 text-center",
        className,
      )}
    >
      <Wrench className="w-7 h-7 text-[var(--f1-text-dim)]" />
      <div className="text-sm text-f1-muted font-mono">{title}</div>
      {subtitle && (
        <div className="text-[11px] text-[var(--f1-text-dim)] font-mono max-w-md">
          {subtitle}
        </div>
      )}
    </div>
  );
}

function ReadyView({
  data,
  className,
}: {
  data: OptimizerResult;
  className?: string;
}) {
  const { driver, totalLaps, strategies, saved } = data;

  if (strategies.length === 0) {
    return (
      <EmptyCard
        title={`No viable strategies for ${driver}`}
        subtitle="The optimizer couldn't find a feasible pit window — likely too few clean laps."
        className={className}
      />
    );
  }

  const best = strategies[0];

  return (
    <div
      className={cn(
        "glass-card p-3 sm:p-5 rounded-xl space-y-4",
        className,
      )}
    >
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-racing-red flex items-center gap-1.5">
            <Wrench className="w-3 h-3" />
            Pit Strategy Optimizer
          </div>
          <div className="text-sm font-bold text-f1 mt-1">
            {driver} · {totalLaps} laps
          </div>
          {data.event && (
            <div className="text-[10px] text-f1-muted font-mono mt-0.5">
              {data.event}
            </div>
          )}
        </div>
        <div className="flex flex-col sm:items-end gap-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-f1-muted">
            <Trophy className="w-3 h-3" />
            Optimal
          </div>
          <div className="text-base sm:text-lg font-bold text-racing-red tabular-nums">
            {formatLapTime(best.estimatedTime)}
          </div>
          <div
            className={cn(
              "text-[10px] font-mono tabular-nums",
              saved >= 0 ? "text-racing-green" : "text-f1-muted",
            )}
          >
            {saved >= 0 ? "−" : "+"}
            {Math.abs(saved).toFixed(1)}s vs no-stop ref
          </div>
        </div>
      </div>

      {/* ── Strategy bars ── */}
      <div className="space-y-3">
        {strategies.map((strat) => (
          <StrategyRow
            key={`${strat.stops}-${strat.pitLaps.join("-")}-${strat.rank}`}
            strategy={strat}
            totalLaps={totalLaps}
            isBest={strat.rank === 1}
            bestTime={best.estimatedTime}
          />
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 border-t border-[var(--f1-border)]">
        <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-muted">
          Compounds
        </div>
        {(["SOFT", "MEDIUM", "HARD"] as const).map((c) => (
          <div key={c} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getTireColor(c) }}
              aria-hidden="true"
            />
            <span className="text-[10px] font-mono text-f1-muted">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface StrategyRowProps {
  strategy: OptimizerStrategy;
  totalLaps: number;
  isBest: boolean;
  bestTime: number;
}

function StrategyRow({
  strategy,
  totalLaps,
  isBest,
  bestTime,
}: StrategyRowProps) {
  const { stops, pitLaps, compounds, estimatedTime, rank } = strategy;
  // Segment boundaries: [0, pit_1, pit_2, ..., totalLaps]
  const boundaries: number[] = [0, ...pitLaps, totalLaps];
  const segments: Array<{ start: number; end: number; compound: string }> = [];
  for (let i = 0; i < compounds.length; i++) {
    segments.push({
      start: boundaries[i],
      end: boundaries[i + 1],
      compound: compounds[i] ?? "UNKNOWN",
    });
  }

  const delta = estimatedTime - bestTime;

  return (
    <div
      className={cn(
        "relative rounded-lg p-2.5 sm:p-3 transition-all",
        isBest
          ? "bg-racing-red/[0.07] ring-2 ring-racing-red/60 shadow-[0_0_24px_-6px_rgba(220,38,38,0.5)]"
          : "bg-[var(--f1-hover)] border border-[var(--f1-border)]",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded",
              isBest
                ? "bg-racing-red text-white"
                : "bg-[var(--f1-card)] text-f1-muted",
            )}
          >
            #{rank}
          </span>
          <span className="text-xs font-mono font-bold text-f1">
            {stops}-stop
          </span>
          <span className="text-[10px] font-mono text-f1-muted truncate hidden sm:inline">
            pit lap{pitLaps.length === 1 ? "" : "s"}: {pitLaps.join(", ")}
          </span>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div className="flex items-center gap-1 text-[10px] font-mono text-f1-muted">
            <Clock className="w-3 h-3" />
            <span className="tabular-nums">
              {formatLapTime(estimatedTime)}
            </span>
          </div>
          {!isBest && delta > 0 && (
            <span className="text-[10px] font-mono tabular-nums text-f1-muted">
              +{delta.toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Mobile: show pit laps below header since they're hidden in the header on sm */}
      <div className="text-[10px] font-mono text-f1-muted truncate mb-1.5 sm:hidden">
        pit lap{pitLaps.length === 1 ? "" : "s"}: {pitLaps.join(", ")}
      </div>

      {/* The lap timeline */}
      <div
        className="relative h-7 sm:h-8 rounded-md overflow-hidden bg-[var(--f1-card)] border border-[var(--f1-border)]"
        role="img"
        aria-label={`${stops}-stop strategy with pit laps ${pitLaps.join(", ")} and compounds ${compounds.join(", ")}`}
      >
        {/* Compound segments */}
        {segments.map((seg, i) => {
          const widthPct = ((seg.end - seg.start) / totalLaps) * 100;
          const leftPct = (seg.start / totalLaps) * 100;
          const color = getTireColor(seg.compound);
          // Lighten the bar slightly so the segment colour reads as a fill,
          // not a flat block. We use a vertical gradient.
          return (
            <div
              key={`seg-${i}`}
              className="absolute inset-y-0 flex items-center justify-center"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                background: `linear-gradient(180deg, ${color}90, ${color}55)`,
                borderRight:
                  i < segments.length - 1
                    ? `2px solid rgba(0,0,0,0.6)`
                    : undefined,
              }}
            >
              {widthPct > 8 && (
                <span
                  className="text-[9px] font-mono font-bold uppercase tracking-wider"
                  style={{
                    color:
                      seg.compound === "HARD" || seg.compound === "MEDIUM"
                        ? "#000"
                        : "#fff",
                    textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                  }}
                >
                  {seg.compound[0]}
                </span>
              )}
            </div>
          );
        })}

        {/* Pit lap tick marks */}
        {pitLaps.map((lap) => {
          const leftPct = (lap / totalLaps) * 100;
          return (
            <div
              key={`tick-${lap}`}
              className="absolute inset-y-0 w-px bg-white/90"
              style={{ left: `${leftPct}%` }}
              aria-hidden="true"
            >
              <span
                className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
              />
            </div>
          );
        })}

        {/* Start / finish flag indicators */}
        <Flag
          className="absolute -left-px top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-white/40"
          aria-hidden="true"
        />
        <Flag
          className="absolute -right-px top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-white/40"
          aria-hidden="true"
        />
      </div>

      {/* Compound order */}
      <div className="mt-1.5 flex items-center gap-1 text-[9px] font-mono text-f1-muted overflow-x-auto">
        <span className="uppercase tracking-widest mr-1">stints</span>
        {compounds.map((c, i) => (
          <span key={`${c}-${i}`} className="flex items-center gap-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ backgroundColor: getTireColor(c) }}
              aria-hidden="true"
            />
            <span style={{ color: getTireColor(c) }}>{c}</span>
            {i < compounds.length - 1 && (
              <span className="text-[var(--f1-text-dim)]">→</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
