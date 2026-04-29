"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { TooltipProps } from "recharts";
import { cn } from "@/lib/utils";

interface DriverMeta {
  code: string;
  name: string;
  teamColor: string;
  driverNumber: number;
}

interface PositionPoint {
  lap: number;
  position: number;
}

interface LapPositionProps {
  drivers: DriverMeta[];
  /** positionsByLap[driverNumber] = array of { lap, position } */
  positionsByLap: Record<number, PositionPoint[]>;
  totalLaps: number;
  highlightDriver?: number;
  loading?: boolean;
}


export default function LapPositionChart({
  drivers,
  positionsByLap,
  totalLaps,
  highlightDriver,
  loading = false,
}: LapPositionProps) {
  // Hover state — controls which driver line is fully opaque vs dimmed.
  const [hovered, setHovered] = useState<string | null>(null);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="w-full h-[420px] sm:h-[460px] glass-card flex items-center justify-center">
        <div className="skeleton w-[90%] h-[80%]" />
      </div>
    );
  }

  const driversWithData = drivers.filter(
    (d) =>
      Array.isArray(positionsByLap[d.driverNumber]) &&
      positionsByLap[d.driverNumber].length > 0,
  );

  // Highest lap with any data — guards against padding past race end.
  let maxLapWithData = 0;
  for (const d of driversWithData) {
    for (const p of positionsByLap[d.driverNumber]) {
      if (p.lap > maxLapWithData) maxLapWithData = p.lap;
    }
  }

  // ── Empty state — needs ≥ 2 laps for crossings to be meaningful ──
  if (driversWithData.length === 0 || maxLapWithData < 2) {
    return (
      <div className="w-full h-[420px] sm:h-[460px] glass-card flex items-center justify-center">
        <p className="ferrari-label text-f1-muted">
          Position chart appears once 2+ laps complete
        </p>
      </div>
    );
  }

  const lastLap = Math.min(totalLaps, maxLapWithData);

  // Pre-index for O(1) lap lookup while building the merged dataset.
  const indexed: Record<number, Map<number, number>> = {};
  for (const d of driversWithData) {
    const m = new Map<number, number>();
    for (const p of positionsByLap[d.driverNumber]) m.set(p.lap, p.position);
    indexed[d.driverNumber] = m;
  }

  // Build chart rows: { lap, [code]: position }.
  // Track the maximum position observed so the Y-axis can extend beyond
  // the default [1, 20] when rare data lands a P21+ entry.
  type Row = { lap: number } & Record<string, number | null>;
  const data: Row[] = [];
  let observedMaxPosition = 1;
  for (let lap = 1; lap <= lastLap; lap++) {
    const row: Row = { lap };
    for (const d of driversWithData) {
      const pos = indexed[d.driverNumber].get(lap);
      row[d.code] = pos ?? null;
      if (pos !== undefined && pos > observedMaxPosition) observedMaxPosition = pos;
    }
    data.push(row);
  }

  // Determine which drivers' end-of-line labels are visible (top 10 only).
  const finalLapPositions = new Map<string, number>();
  for (const d of driversWithData) {
    // Walk back from lastLap to find the last known position.
    for (let lap = lastLap; lap >= 1; lap--) {
      const pos = indexed[d.driverNumber].get(lap);
      if (pos !== undefined) {
        finalLapPositions.set(d.code, pos);
        break;
      }
    }
  }

  function isLineActive(code: string): boolean {
    if (hovered !== null) return code === hovered;
    if (highlightDriver !== undefined) {
      const target = driversWithData.find((d) => d.driverNumber === highlightDriver);
      return target ? code === target.code : true;
    }
    return true;
  }

  function isLineDimmed(code: string): boolean {
    if (hovered !== null) return code !== hovered;
    if (highlightDriver !== undefined) {
      const target = driversWithData.find((d) => d.driverNumber === highlightDriver);
      return target ? code !== target.code : false;
    }
    return false;
  }

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
      .slice(0, 10);
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
          minWidth: 130,
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
        {numeric.map((p) => (
          <div
            key={String(p.dataKey)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              color: p.color ?? "#fff",
            }}
          >
            <span>P{p.value}</span>
            <span>{String(p.dataKey)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="w-full h-[420px] sm:h-[460px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 36, left: -10, bottom: 0 }}>
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
              // P1 at top, P20 at bottom.
              reversed
              type="number"
              domain={[1, Math.max(20, observedMaxPosition)]}
              ticks={Array.from(
                { length: Math.ceil(Math.max(20, observedMaxPosition) / 5) + 1 },
                (_, i) => Math.min(Math.max(20, observedMaxPosition), Math.max(1, i * 5)),
              )}
              tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `P${v}`}
              width={42}
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
            />
            {driversWithData.map((d) => {
              const dimmed = isLineDimmed(d.code);
              const active = isLineActive(d.code);
              const finalPos = finalLapPositions.get(d.code);
              const showLabel = finalPos !== undefined && finalPos <= 10;
              return (
                <Line
                  key={d.code}
                  type="monotone"
                  dataKey={d.code}
                  stroke={d.teamColor}
                  strokeWidth={active && hovered === d.code ? 2.5 : 1.5}
                  strokeOpacity={dimmed ? 0.2 : 1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  // connectNulls=false: a retired driver's line stops at their last
                  // known position rather than smearing forward to the chart edge.
                  connectNulls={false}
                  isAnimationActive={false}
                  onMouseEnter={() => setHovered(d.code)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {showLabel && (
                    <LabelList
                      dataKey={d.code}
                      position="right"
                      // recharts' content callback receives a wide Props shape;
                      // we narrow with a local cast and only render the final point.
                      content={(props) => {
                        const p = props as {
                          x?: number;
                          y?: number;
                          value?: number | string;
                          index?: number;
                        };
                        if (p.index !== data.length - 1) return null;
                        if (p.x === undefined || p.y === undefined) return null;
                        if (p.value === null || p.value === undefined) return null;
                        return (
                          <text
                            x={p.x + 6}
                            y={p.y}
                            dy={3}
                            fill={d.teamColor}
                            fontSize={10}
                            fontFamily="Fira Code"
                            fontWeight={600}
                            opacity={dimmed ? 0.3 : 1}
                          >
                            {d.code}
                          </text>
                        );
                      }}
                    />
                  )}
                </Line>
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Compact legend chips. */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 px-1">
        {driversWithData.map((d) => {
          const dimmed = isLineDimmed(d.code);
          return (
            <button
              key={d.code}
              type="button"
              onMouseEnter={() => setHovered(d.code)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(d.code)}
              onBlur={() => setHovered(null)}
              className={cn(
                "flex items-center gap-1.5 font-mono text-[11px] tracking-wide tabular-nums focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-sm px-1 -mx-1 transition-opacity",
                dimmed ? "text-f1-muted opacity-60" : "text-f1-sub",
              )}
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: d.teamColor }}
                aria-hidden
              />
              <span>{d.code}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
