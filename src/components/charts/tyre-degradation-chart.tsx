"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatLapTime, getTireColor } from "@/lib/utils";

type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

interface StintCurvePoint {
  tireAge: number;
  correctedLapTime: number;
}

interface DegradationStint {
  driverNumber: number;
  driverCode: string;
  teamColor: string;
  compound: Compound;
  stintNumber: number;
  curve: StintCurvePoint[];
  /** Optional pre-computed slope (s/lap). Shown on the legend chip. */
  slope?: number;
}

interface TyreDegradationProps {
  stints: DegradationStint[];
  /** Driver number to highlight; non-highlighted stints are dashed/dimmed. */
  highlightDriver?: number;
}

type YMode = "corrected" | "delta";

const MIN_POINTS_FOR_FIT = 5;

function buildStintKey(stint: DegradationStint): string {
  return `${stint.driverCode}-S${stint.stintNumber}-${stint.compound}`;
}

export default function TyreDegradationChart({
  stints,
  highlightDriver,
}: TyreDegradationProps) {
  const [yMode, setYMode] = useState<YMode>("corrected");

  const usableStints = useMemo(
    () => stints.filter((s) => s.curve && s.curve.length >= MIN_POINTS_FOR_FIT),
    [stints],
  );

  // Pre-compute delta-from-start once per stint so tooltips don't recalc.
  const stintsWithDelta = useMemo(
    () =>
      usableStints.map((stint) => {
        const baseline = stint.curve[0]?.correctedLapTime ?? 0;
        return {
          ...stint,
          key: buildStintKey(stint),
          enriched: stint.curve.map((p) => ({
            tireAge: p.tireAge,
            corrected: p.correctedLapTime,
            delta: p.correctedLapTime - baseline,
          })),
        };
      }),
    [usableStints],
  );

  // Recharts wants a single rectangular dataset keyed by x. We pivot
  // each stint's series onto a shared `tireAge` axis with a per-stint
  // dataKey so missing points just don't render.
  const { chartData, maxAge } = useMemo(() => {
    let mx = 0;
    const buckets: Record<number, Record<string, number>> = {};
    for (const s of stintsWithDelta) {
      for (const point of s.enriched) {
        if (point.tireAge > mx) mx = point.tireAge;
        if (!buckets[point.tireAge]) buckets[point.tireAge] = { tireAge: point.tireAge };
        const value = yMode === "corrected" ? point.corrected : point.delta;
        buckets[point.tireAge][s.key] = Number(value.toFixed(3));
      }
    }
    const data = Object.values(buckets).sort((a, b) => a.tireAge - b.tireAge);
    return { chartData: data, maxAge: mx };
  }, [stintsWithDelta, yMode]);

  // Empty state — no stint has enough usable laps to draw a curve.
  if (stintsWithDelta.length === 0) {
    return (
      <div className="w-full h-[320px] sm:h-[400px] flex items-center justify-center px-6">
        <div className="text-center max-w-xs">
          <p className="text-f1-sub text-sm">
            Need 5+ laps in a stint for meaningful curve
          </p>
          <p className="text-f1-muted text-xs mt-1">
            Pit-in / pit-out laps are excluded automatically
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Y-axis mode toggle */}
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <span className="text-ferrari-label text-[10px] sm:text-[11px]">
          Tyre Degradation
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYMode("corrected")}
            className={cn(
              "px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
              "border border-white/10 rounded-sm",
              yMode === "corrected"
                ? "bg-white/10 text-f1"
                : "text-f1-muted hover:text-f1-sub",
            )}
          >
            Corrected
          </button>
          <button
            type="button"
            onClick={() => setYMode("delta")}
            className={cn(
              "px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
              "border border-white/10 rounded-sm",
              yMode === "delta"
                ? "bg-white/10 text-f1"
                : "text-f1-muted hover:text-f1-sub",
            )}
          >
            Δ from start
          </button>
        </div>
      </div>

      <div className="w-full h-[320px] sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 12, left: -8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="tireAge"
              type="number"
              domain={[0, maxAge]}
              tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              label={{
                value: "Tyre age (laps)",
                position: "insideBottom",
                offset: -2,
                fill: "#8F8F8F",
                fontSize: 10,
                fontFamily: "Fira Code",
              }}
            />
            <YAxis
              tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) =>
                yMode === "corrected" ? v.toFixed(1) : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`
              }
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(21,21,30,0.97)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "2px",
                fontSize: "12px",
                fontFamily: "Fira Code",
                backdropFilter: "blur(12px)",
                boxShadow: "rgb(153,153,153) 1px 1px 1px 0px",
                padding: "8px 10px",
              }}
              labelStyle={{
                color: "#969696",
                fontSize: "10px",
                letterSpacing: "1px",
                textTransform: "uppercase" as const,
                marginBottom: "4px",
              }}
              labelFormatter={(label: number) => `Tyre age: ${label} lap${label === 1 ? "" : "s"}`}
              formatter={(value: number, name: string) => {
                if (yMode === "corrected") {
                  return [formatLapTime(value), name];
                }
                const sign = value >= 0 ? "+" : "";
                return [`${sign}${value.toFixed(3)}s`, name];
              }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "10px",
                fontFamily: "Fira Code",
                letterSpacing: "0.5px",
                paddingTop: "4px",
              }}
              iconType="plainline"
              formatter={(value: string) => {
                const stint = stintsWithDelta.find((s) => s.key === value);
                if (!stint) return value;
                const compoundLetter = stint.compound.charAt(0);
                const slopePart =
                  typeof stint.slope === "number"
                    ? ` ${stint.slope >= 0 ? "+" : ""}${stint.slope.toFixed(3)}s/lap`
                    : "";
                return `${stint.driverCode} ${compoundLetter}${slopePart}`;
              }}
            />
            {stintsWithDelta.map((stint) => {
              const isHighlighted =
                highlightDriver === undefined ||
                highlightDriver === stint.driverNumber;
              const stroke = getTireColor(stint.compound);
              return (
                <Line
                  key={stint.key}
                  type="monotone"
                  dataKey={stint.key}
                  stroke={stroke}
                  strokeWidth={isHighlighted ? 2.25 : 1.5}
                  strokeDasharray={
                    highlightDriver !== undefined && !isHighlighted ? "4 3" : undefined
                  }
                  strokeOpacity={isHighlighted ? 1 : 0.55}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
