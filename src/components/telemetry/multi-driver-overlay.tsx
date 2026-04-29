"use client";

/**
 * Multi-driver telemetry overlay — the "qualifying analysis" view used by
 * every YouTube F1 analyst. Up to 4 drivers, distance-aligned X-axis,
 * stacked sub-charts for Speed / Throttle+Brake / Gear / DRS.
 *
 * Data comes from the FastF1 Python sidecar at /api/fastf1/telemetry.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Loader2, Activity } from "lucide-react";
import {
  fetchTelemetryOverlay,
  FastF1Error,
  type SessionCode,
  type TelemetryDriver,
  type TelemetryOverlayResponse,
} from "@/lib/fastf1-client";
import { cn, formatLapTime, getTeamColor, getTireColor } from "@/lib/utils";

export interface MultiDriverOverlayProps {
  year: number;
  round: number;
  session: SessionCode;
  /** 1–4 driver codes (e.g. ["VER", "NOR"]) */
  drivers: string[];
  /** "fastest" (default) or a specific lap number */
  lap?: "fastest" | number;
  className?: string;
}

interface MergedRow {
  distance: number;
  /** Per-driver fields, keyed as `${code}_speed`, `${code}_throttle`, etc. */
  [key: string]: number | undefined;
}

// ── Visual constants ──────────────────────────────────────────────────

const AXIS_COLOR = "rgba(255,255,255,0.08)";
const TICK_COLOR = "rgba(255,255,255,0.3)";
const GRID_COLOR = "rgba(255,255,255,0.04)";
const TICK_FONT = { fill: TICK_COLOR, fontSize: 10, fontFamily: "Fira Code" };

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Merge per-driver telemetry arrays onto a shared distance grid.
 *
 * The Python sidecar already resamples each driver onto an evenly-spaced grid
 * derived from that driver's own lap distance. To overlay them we project
 * everything onto a single grid spanning [0, max(lapDistance)].
 *
 * Two drivers on the same track will have very similar total lap distances
 * (within a few metres), so a simple linear interpolation onto a unified
 * grid is fine for visual comparison.
 */
function buildMergedRows(
  drivers: TelemetryDriver[],
  nPoints = 500,
): MergedRow[] {
  if (drivers.length === 0) return [];

  let maxDist = 0;
  for (const d of drivers) {
    const last = d.telemetry[d.telemetry.length - 1];
    if (last && last.distance > maxDist) maxDist = last.distance;
  }
  if (maxDist <= 0) return [];

  const grid: number[] = new Array(nPoints);
  for (let i = 0; i < nPoints; i++) {
    grid[i] = (maxDist * i) / (nPoints - 1);
  }

  // For each driver, pre-compute distance arrays for binary search.
  const distByDriver = drivers.map((d) =>
    d.telemetry.map((p) => p.distance),
  );

  function interp(
    driverIdx: number,
    target: number,
    field: keyof Omit<TelemetryDriver["telemetry"][number], "distance">,
  ): number | undefined {
    const dist = distByDriver[driverIdx];
    const samples = drivers[driverIdx].telemetry;
    if (samples.length === 0) return undefined;
    if (target <= dist[0]) return samples[0][field];
    if (target >= dist[dist.length - 1]) return samples[samples.length - 1][field];

    // Binary search for the upper bound
    let lo = 0;
    let hi = dist.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (dist[mid] <= target) lo = mid;
      else hi = mid;
    }
    const x0 = dist[lo];
    const x1 = dist[hi];
    const span = x1 - x0;
    if (span <= 0) return samples[lo][field];
    const t = (target - x0) / span;
    const v0 = samples[lo][field];
    const v1 = samples[hi][field];
    // For discrete fields (gear/drs/brake) snap to the closer side
    if (field === "gear" || field === "drs" || field === "brake") {
      return t < 0.5 ? v0 : v1;
    }
    return v0 + (v1 - v0) * t;
  }

  const rows: MergedRow[] = new Array(nPoints);
  for (let i = 0; i < nPoints; i++) {
    const d = grid[i];
    const row: MergedRow = { distance: Math.round(d) };
    for (let di = 0; di < drivers.length; di++) {
      const code = drivers[di].code;
      row[`${code}_speed`] = interp(di, d, "speed");
      row[`${code}_throttle`] = interp(di, d, "throttle");
      row[`${code}_brake`] = interp(di, d, "brake");
      row[`${code}_gear`] = interp(di, d, "gear");
      row[`${code}_drs`] = interp(di, d, "drs");
    }
    rows[i] = row;
  }
  return rows;
}

function colorFor(driver: TelemetryDriver): string {
  // Map FastF1's `team` value (varies in casing) onto the project team
  // colour palette. Falls back to the utils default grey.
  return getTeamColor(driver.team);
}

// ── Tooltip ──────────────────────────────────────────────────────────

function TelemetryTooltip({
  active,
  payload,
  label,
  metric,
  unit,
  drivers,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: number;
  metric: "speed" | "throttle" | "gear" | "drs";
  unit: string;
  drivers: TelemetryDriver[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-black/80 backdrop-blur-md px-3 py-2 text-xs font-mono">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted mb-1">
        {Math.round(label ?? 0)}m
      </div>
      {drivers.map((d) => {
        const key = `${d.code}_${metric}`;
        const entry = payload.find((p) => p.dataKey === key);
        if (!entry) return null;
        return (
          <div key={d.code} className="flex items-center justify-between gap-3">
            <span style={{ color: colorFor(d) }} className="font-bold">
              {d.code}
            </span>
            <span className="text-f1 tabular-nums">
              {metric === "drs"
                ? entry.value >= 0.5
                  ? "ON"
                  : "OFF"
                : `${Math.round(entry.value)}${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-chart ────────────────────────────────────────────────────────

interface SubChartProps {
  data: MergedRow[];
  drivers: TelemetryDriver[];
  metric: "speed" | "throttle" | "gear" | "drs";
  unit: string;
  domain?: [number | "auto", number | "auto"];
  height: number;
  yLabel: string;
  showXAxis?: boolean;
  /** Optional secondary metric drawn as a thinner dashed line (used for brake) */
  secondary?: { metric: "brake"; label: string };
}

function SubChart({
  data,
  drivers,
  metric,
  unit,
  domain = ["auto", "auto"],
  height,
  yLabel,
  showXAxis = false,
  secondary,
}: SubChartProps) {
  return (
    <div className="w-full" style={{ height }}>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-muted">
          {yLabel}
        </span>
        {secondary && (
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-racing-red/70">
            – – {secondary.label}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 0, right: 8, left: -16, bottom: showXAxis ? 16 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis
            dataKey="distance"
            type="number"
            domain={[0, "dataMax"]}
            tick={showXAxis ? TICK_FONT : false}
            axisLine={{ stroke: AXIS_COLOR }}
            tickLine={false}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}km`}
            label={
              showXAxis
                ? {
                    value: "Distance",
                    position: "insideBottomRight",
                    offset: -2,
                    fill: TICK_COLOR,
                    fontSize: 10,
                  }
                : undefined
            }
          />
          <YAxis
            domain={domain}
            tick={TICK_FONT}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.15)", strokeDasharray: "3 3" }}
            content={
              <TelemetryTooltip
                drivers={drivers}
                metric={metric}
                unit={unit}
              />
            }
          />
          {drivers.map((d) => (
            <Line
              key={`${d.code}_${metric}`}
              type="monotone"
              dataKey={`${d.code}_${metric}`}
              stroke={colorFor(d)}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          {secondary &&
            drivers.map((d) => (
              <Line
                key={`${d.code}_${secondary.metric}`}
                type="step"
                dataKey={`${d.code}_${secondary.metric}`}
                stroke={colorFor(d)}
                strokeOpacity={0.5}
                strokeWidth={1.2}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; firstRequest: boolean }
  | { kind: "ready"; data: TelemetryOverlayResponse }
  | { kind: "error"; message: string };

export default function MultiDriverOverlay({
  year,
  round,
  session,
  drivers,
  lap = "fastest",
  className,
}: MultiDriverOverlayProps) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const hasFetchedOnce = useRef(false);

  // ── Fetch on input change ──
  useEffect(() => {
    if (drivers.length === 0) {
      setState({ kind: "idle" });
      return;
    }
    if (drivers.length > 4) {
      setState({ kind: "error", message: "Select at most 4 drivers" });
      return;
    }

    const controller = new AbortController();
    setState({
      kind: "loading",
      firstRequest: !hasFetchedOnce.current,
    });

    fetchTelemetryOverlay({
      year,
      round,
      session,
      drivers,
      lap,
      signal: controller.signal,
    })
      .then((data) => {
        hasFetchedOnce.current = true;
        if (!controller.signal.aborted) {
          setState({ kind: "ready", data });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof FastF1Error) {
          setState({ kind: "error", message: err.message });
        } else if (err instanceof Error && err.name !== "AbortError") {
          setState({ kind: "error", message: err.message });
        }
      });

    return () => controller.abort();
    // We intentionally serialize the drivers array for stable dep tracking.
  }, [year, round, session, drivers.join(","), lap]);

  // ── Empty state ──
  if (drivers.length === 0) {
    return (
      <div
        className={cn(
          "glass-card p-12 rounded-xl flex flex-col items-center gap-3 text-center",
          className,
        )}
      >
        <Activity className="w-8 h-8 text-[var(--f1-text-dim)]" />
        <div className="text-sm text-f1-muted font-mono">
          Select drivers to compare
        </div>
        <div className="text-[11px] text-[var(--f1-text-dim)] font-mono">
          Up to 4 drivers · distance-aligned overlay
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div
        className={cn(
          "glass-card p-12 rounded-xl flex flex-col items-center gap-3 text-center",
          className,
        )}
      >
        <Loader2 className="w-6 h-6 text-racing-red animate-spin" />
        <div className="text-sm text-f1 font-mono">Loading telemetry…</div>
        {state.kind === "loading" && state.firstRequest && (
          <div className="text-[11px] text-f1-muted font-mono max-w-sm">
            This may take a moment on the first request — the FastF1 archive
            is warming up.
          </div>
        )}
      </div>
    );
  }

  // ── Error ──
  if (state.kind === "error") {
    return (
      <div
        className={cn(
          "glass-card p-8 rounded-xl border border-racing-red/40 flex flex-col items-center gap-3 text-center",
          className,
        )}
      >
        <AlertTriangle className="w-7 h-7 text-racing-red" />
        <div className="text-sm font-mono text-racing-red">
          Couldn&apos;t load telemetry
        </div>
        <div className="text-[11px] text-f1-muted font-mono max-w-md">
          {state.message}
        </div>
      </div>
    );
  }

  // ── Ready: render charts ──
  return <ReadyView data={state.data} className={className} />;
}

function ReadyView({
  data,
  className,
}: {
  data: TelemetryOverlayResponse;
  className?: string;
}) {
  const { drivers } = data;

  const merged = useMemo(() => buildMergedRows(drivers, 500), [drivers]);

  if (drivers.length === 0 || merged.length === 0) {
    return (
      <div
        className={cn(
          "glass-card p-12 rounded-xl flex flex-col items-center gap-3 text-center",
          className,
        )}
      >
        <Activity className="w-8 h-8 text-[var(--f1-text-dim)]" />
        <div className="text-sm text-f1-muted font-mono">
          No telemetry returned for the selected drivers.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("glass-card p-3 sm:p-5 rounded-xl space-y-3", className)}>
      {/* ── Header / legend ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-f1-muted">
            {data.event || data.circuit} · {data.session}
          </div>
          <div className="text-sm font-bold text-f1 mt-0.5">
            Telemetry overlay · {drivers.length} driver
            {drivers.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {drivers.map((d) => (
            <DriverChip key={d.code} driver={d} />
          ))}
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="space-y-2">
        <SubChart
          data={merged}
          drivers={drivers}
          metric="speed"
          unit=" km/h"
          yLabel="Speed (km/h)"
          height={200}
        />
        <SubChart
          data={merged}
          drivers={drivers}
          metric="throttle"
          unit="%"
          domain={[0, 100]}
          yLabel="Throttle (%)"
          height={140}
          secondary={{ metric: "brake", label: "brake" }}
        />
        <SubChart
          data={merged}
          drivers={drivers}
          metric="gear"
          unit=""
          domain={[0, 8]}
          yLabel="Gear"
          height={120}
        />
        <SubChart
          data={merged}
          drivers={drivers}
          metric="drs"
          unit=""
          domain={[0, 1]}
          yLabel="DRS"
          height={90}
          showXAxis
        />
      </div>

      {data.warnings && data.warnings.length > 0 && (
        <div className="rounded-md border border-racing-amber/30 bg-racing-amber/5 px-3 py-2 text-[11px] font-mono text-racing-amber/80">
          {data.warnings.join(" · ")}
        </div>
      )}
    </div>
  );
}

function DriverChip({ driver }: { driver: TelemetryDriver }) {
  const color = colorFor(driver);
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-2 py-1"
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}10`,
      }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs font-mono font-bold" style={{ color }}>
        {driver.code}
      </span>
      <span className="text-[11px] font-mono text-f1 tabular-nums">
        {formatLapTime(driver.lapTime)}
      </span>
      <span
        className="text-[10px] font-mono uppercase tracking-widest"
        style={{ color: getTireColor(driver.compound) }}
      >
        {driver.compound.charAt(0)}
      </span>
    </div>
  );
}
