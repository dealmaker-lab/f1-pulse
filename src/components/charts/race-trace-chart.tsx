"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import type { TooltipProps } from "recharts";
import { cn } from "@/lib/utils";

interface DriverMeta {
  code: string;
  name: string;
  teamColor: string;
  driverNumber: number;
}

interface LapPoint {
  lap: number;
  gapToLeader: number | null;
  pitLap: boolean;
}

interface RaceTraceProps {
  drivers: DriverMeta[];
  /** lapData[driverNumber] = array of { lap, gapToLeader, pitLap } */
  lapData: Record<number, LapPoint[]>;
  totalLaps: number;
  /** Optional driver number to highlight (thicker stroke, full opacity). */
  highlightDriver?: number;
  loading?: boolean;
}


export default function RaceTraceChart({
  drivers,
  lapData,
  totalLaps,
  highlightDriver,
  loading = false,
}: RaceTraceProps) {
  // ── Loading state ──
  if (loading) {
    return (
      <div className="w-full h-[420px] sm:h-[460px] glass-card flex items-center justify-center">
        <div className="skeleton w-[90%] h-[80%]" />
      </div>
    );
  }

  // ── Build merged dataset: one row per lap, keys = driver codes ──
  // We project gaps onto a dense lap axis 1..totalLaps so lines connect cleanly.
  const driversWithData = drivers.filter(
    (d) => Array.isArray(lapData[d.driverNumber]) && lapData[d.driverNumber].length > 0,
  );

  // Determine the highest lap that has any data (so we don't pad past the race).
  let maxLapWithData = 0;
  for (const d of driversWithData) {
    const arr = lapData[d.driverNumber];
    for (const p of arr) {
      if (p.lap > maxLapWithData) maxLapWithData = p.lap;
    }
  }

  // ── Empty state — race trace needs at least 3 laps to be meaningful ──
  if (driversWithData.length === 0 || maxLapWithData < 3) {
    return (
      <div className="w-full h-[420px] sm:h-[460px] glass-card flex items-center justify-center">
        <p className="ferrari-label text-f1-muted">
          Race trace appears once 3+ laps complete
        </p>
      </div>
    );
  }

  const lastLap = Math.min(totalLaps, maxLapWithData);

  // Pre-index each driver's points by lap for O(1) lookup while building rows.
  const indexed: Record<number, Map<number, LapPoint>> = {};
  for (const d of driversWithData) {
    const m = new Map<number, LapPoint>();
    for (const p of lapData[d.driverNumber]) m.set(p.lap, p);
    indexed[d.driverNumber] = m;
  }

  // Build chart rows: { lap, [code]: gap, [code]_pit: boolean }.
  type Row = { lap: number } & Record<string, number | boolean | null>;
  const data: Row[] = [];
  for (let lap = 1; lap <= lastLap; lap++) {
    const row: Row = { lap };
    for (const d of driversWithData) {
      const point = indexed[d.driverNumber].get(lap);
      row[d.code] = point && point.gapToLeader !== null ? point.gapToLeader : null;
      row[`${d.code}_pit`] = point?.pitLap === true;
    }
    data.push(row);
  }

  // Pit-stop reference dots: collect for highlighted driver only when set,
  // otherwise for all drivers (capped to keep DOM light).
  const pitMarkers: Array<{ lap: number; gap: number; color: string; key: string }> = [];
  for (const d of driversWithData) {
    if (highlightDriver !== undefined && d.driverNumber !== highlightDriver) continue;
    const arr = lapData[d.driverNumber];
    for (const p of arr) {
      if (p.pitLap && p.gapToLeader !== null && p.lap <= lastLap) {
        pitMarkers.push({
          lap: p.lap,
          gap: p.gapToLeader,
          color: d.teamColor,
          key: `${d.code}-${p.lap}`,
        });
      }
    }
  }

  // Custom tooltip — show top 5 drivers by gap at the hovered lap.
  // Uses function form of recharts' `content` prop so types flow naturally.
  function renderTooltip(props: TooltipProps<number, string>) {
    const { active, payload, label } = props;
    if (!active || !payload || payload.length === 0) return null;
    type Item = { dataKey?: string | number; value: number; color?: string };
    const numeric: Item[] = payload
      .filter((p): p is typeof p & { value: number } =>
        typeof p.value === "number" && p.value !== null,
      )
      .map((p) => ({
        dataKey: p.dataKey as string | number | undefined,
        value: p.value,
        color: p.color,
      }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 5);
    return (
      <div
        className="tabular-nums"
        style={{
          background: "rgba(21,21,30,0.97)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "2px",
          fontFamily: "Fira Code",
          fontSize: "12px",
          padding: "8px 10px",
          backdropFilter: "blur(12px)",
          boxShadow: "rgb(153,153,153) 1px 1px 1px 0px",
          minWidth: 140,
        }}
      >
        <div
          style={{
            color: "#969696",
            fontSize: "11px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Lap {label}
        </div>
        {numeric.map((p) => {
          const gap = p.value;
          return (
            <div
              key={String(p.dataKey)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                color: p.color ?? "#fff",
              }}
            >
              <span>{String(p.dataKey)}</span>
              <span>{gap === 0 ? "LEADER" : `+${gap.toFixed(3)}`}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="w-full h-[400px] sm:h-[440px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="lap"
              type="number"
              domain={[1, lastLap]}
              allowDecimals={false}
              tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              label={{
                value: "Lap",
                position: "insideBottomRight",
                offset: -4,
                fill: "rgba(255,255,255,0.2)",
                fontSize: 10,
              }}
            />
            <YAxis
              // Inverted: 0 (leader) at top, falling cars go down.
              reversed
              tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v === 0 ? "LEADER" : `+${v.toFixed(0)}s`)}
              width={60}
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
            />
            {driversWithData.map((d) => {
              const isHighlighted =
                highlightDriver !== undefined && d.driverNumber === highlightDriver;
              const dimmed =
                highlightDriver !== undefined && d.driverNumber !== highlightDriver;
              return (
                <Line
                  key={d.code}
                  type="monotone"
                  dataKey={d.code}
                  stroke={d.teamColor}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeOpacity={dimmed ? 0.3 : 1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
            {/* Pit-stop reference dots. */}
            {pitMarkers.map((m) => (
              <ReferenceDot
                key={m.key}
                x={m.lap}
                y={m.gap}
                r={3}
                fill={m.color}
                stroke="#0a0a0a"
                strokeWidth={1}
                isFront
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend chips at bottom. */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 px-1">
        {driversWithData.map((d) => {
          const dimmed =
            highlightDriver !== undefined && d.driverNumber !== highlightDriver;
          return (
            <div
              key={d.code}
              className={cn(
                "flex items-center gap-1.5 font-mono text-[11px] tracking-wide tabular-nums",
                dimmed ? "text-f1-muted opacity-60" : "text-f1-sub",
              )}
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: d.teamColor }}
                aria-hidden
              />
              <span>{d.code}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
