"use client";

import { getTeamColor, getTireColor } from "@/lib/utils";
import { StrategyStint } from "@/types/f1";

interface Props {
  strategies: StrategyStint[];
  totalLaps: number;
}

export default function StrategyChart({ strategies, totalLaps }: Props) {
  const safeTotalLaps = totalLaps > 0 ? totalLaps : 57;
  const barHeight = 32;
  const rowGap = 6;
  const leftPad = 56;
  const topPad = 32;
  const rightPad = 16;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Lap scale header */}
        <div className="flex items-center mb-2" style={{ paddingLeft: leftPad }}>
          {Array.from({ length: Math.ceil(safeTotalLaps / 10) + 1 }, (_, i) => {
            const lap = i * 10;
            if (lap > safeTotalLaps) return null;
            return (
              <span
                key={lap}
                className="text-[10px] font-mono text-f1-muted absolute"
                style={{ left: `${leftPad + (lap / safeTotalLaps) * 100}%` }}
              >
                {lap}
              </span>
            );
          })}
        </div>

        {/* Strategy rows */}
        <div className="space-y-1.5">
          {strategies.map((driver) => (
            <div key={driver.driverCode} className="flex items-center gap-2 group">
              {/* Driver code */}
              <div
                className="w-12 text-right font-mono text-xs font-bold flex-shrink-0"
                style={{ color: getTeamColor(driver.team ?? "") }}
              >
                {driver.driverCode}
              </div>

              {/* Stint bars */}
              <div className="flex-1 flex relative" style={{ height: barHeight }}>
                {driver.stints.map((stint, i) => {
                  const compound = stint.compound || "UNKNOWN";
                  const laps = stint.laps > 0 ? stint.laps : 1;
                  const widthPct = Math.min(100, (laps / safeTotalLaps) * 100);
                  return (
                    <div
                      key={i}
                      className="relative flex items-center justify-center text-[10px] font-mono font-bold transition-all duration-200 group-hover:opacity-100"
                      style={{
                        width: `${widthPct}%`,
                        height: barHeight,
                        backgroundColor: getTireColor(compound),
                        color: compound === "HARD" ? "#1a1a2e" : "#fff",
                        opacity: 0.85,
                        borderRadius: i === 0 ? "6px 0 0 6px" : i === driver.stints.length - 1 ? "0 6px 6px 0" : "0",
                        borderRight: i < driver.stints.length - 1 ? "2px solid #0a0a0f" : "none",
                      }}
                      title={`${compound} | Laps ${stint.startLap ?? "?"}-${stint.endLap ?? "?"} | Avg: ${(stint.avgPace ?? 0).toFixed(1)}s`}
                    >
                      <span className="drop-shadow-sm">
                        {laps > 8 ? `${compound.charAt(0)} · ${laps}L` : compound.charAt(0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Tire legend */}
        <div className="flex items-center gap-4 mt-4 px-14">
          {["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((c) => (
            <div key={c} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getTireColor(c) }}
              />
              <span className="text-[10px] font-mono text-f1-sub">{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
