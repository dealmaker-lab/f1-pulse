"use client";

import { getTeamColor, getTireColor } from "@/lib/utils";
import { StrategyStint } from "@/types/f1";

interface Props {
  strategies: StrategyStint[];
  totalLaps: number;
}

export default function StrategyChart({ strategies, totalLaps }: Props) {
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
          {Array.from({ length: Math.ceil(totalLaps / 10) + 1 }, (_, i) => {
            const lap = i * 10;
            if (lap > totalLaps) return null;
            return (
              <span
                key={lap}
                className="text-[10px] font-mono text-white/25 absolute"
                style={{ left: `${leftPad + (lap / totalLaps) * 100}%` }}
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
                style={{ color: getTeamColor(driver.team) }}
              >
                {driver.driverCode}
              </div>

              {/* Stint bars */}
              <div className="flex-1 flex relative" style={{ height: barHeight }}>
                {driver.stints.map((stint, i) => {
                  const widthPct = (stint.laps / totalLaps) * 100;
                  return (
                    <div
                      key={i}
                      className="relative flex items-center justify-center text-[10px] font-mono font-bold transition-all duration-200 group-hover:opacity-100"
                      style={{
                        width: `${widthPct}%`,
                        height: barHeight,
                        backgroundColor: getTireColor(stint.compound),
                        color: stint.compound === "HARD" ? "#1a1a2e" : "#fff",
                        opacity: 0.85,
                        borderRadius: i === 0 ? "6px 0 0 6px" : i === driver.stints.length - 1 ? "0 6px 6px 0" : "0",
                        borderRight: i < driver.stints.length - 1 ? "2px solid #0a0a0f" : "none",
                      }}
                      title={`${stint.compound} | Laps ${stint.startLap}-${stint.endLap} | Avg: ${stint.avgPace.toFixed(1)}s`}
                    >
                      <span className="drop-shadow-sm">
                        {stint.laps > 8 ? `${stint.compound.charAt(0)} · ${stint.laps}L` : stint.compound.charAt(0)}
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
              <span className="text-[10px] font-mono text-white/40">{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
