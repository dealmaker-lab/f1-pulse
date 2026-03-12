"use client";

import { useState } from "react";
import { PieChart, Timer, ArrowUpDown, Fuel } from "lucide-react";
import { cn, getTeamColor, getTireColor, formatLapTime } from "@/lib/utils";
import StrategyChart from "@/components/charts/strategy-chart";
import LapTimesChart from "@/components/charts/lap-times-chart";
import { mockStrategyData, generateMockLapTimes, mockDriverStandings } from "@/data/mock-data";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

// Generate position change data across laps
function generatePositionData(totalLaps: number) {
  const drivers = ["VER", "NOR", "LEC", "PIA", "SAI", "HAM", "RUS", "ALO"];
  const colors: Record<string, string> = {
    VER: "#3671C6", NOR: "#FF8000", LEC: "#E8002D", PIA: "#FF8000",
    SAI: "#E8002D", HAM: "#27F4D2", RUS: "#27F4D2", ALO: "#229971",
  };

  const positions: Record<string, number[]> = {};
  drivers.forEach((d, i) => {
    positions[d] = [i + 1];
  });

  for (let lap = 1; lap <= totalLaps; lap++) {
    drivers.forEach((d) => {
      const prev = positions[d][positions[d].length - 1];
      const change = Math.random() > 0.92 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      positions[d].push(Math.max(1, Math.min(8, prev + change)));
    });
  }

  const data = Array.from({ length: totalLaps + 1 }, (_, lap) => {
    const point: Record<string, any> = { lap };
    drivers.forEach((d) => {
      point[d] = positions[d][lap];
    });
    return point;
  });

  return { data, drivers, colors };
}

// Pit stop durations
const pitStopData = [
  { driver: "VER", team: "Red Bull Racing", stop1: 2.3, stop2: 2.1, total: 4.4 },
  { driver: "NOR", team: "McLaren", stop1: 2.5, stop2: 2.4, total: 4.9 },
  { driver: "LEC", team: "Ferrari", stop1: 2.8, stop2: 2.2, total: 5.0 },
  { driver: "PIA", team: "McLaren", stop1: 2.4, stop2: 2.6, total: 5.0 },
  { driver: "SAI", team: "Ferrari", stop1: 2.7, stop2: 2.3, total: 5.0 },
  { driver: "HAM", team: "Mercedes", stop1: 2.6, stop2: 2.5, total: 5.1 },
  { driver: "RUS", team: "Mercedes", stop1: 2.5, stop2: 2.7, total: 5.2 },
  { driver: "ALO", team: "Aston Martin", stop1: 2.9, stop2: 0, total: 2.9 },
];

export default function StrategyPage() {
  const [selectedDriver, setSelectedDriver] = useState("VER");
  const totalLaps = 57;

  const { data: posData, drivers: posDrivers, colors: posColors } = generatePositionData(totalLaps);
  const driverInfo = mockDriverStandings.find((d) => d.driver.code === selectedDriver);
  const lapTimes = generateMockLapTimes(selectedDriver, totalLaps);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <PieChart className="w-7 h-7 text-racing-green" />
          Strategy Analyzer
        </h1>
        <p className="text-sm text-white/40 mt-1">Tire strategy, pit stops, and position changes</p>
      </div>

      {/* Race selector bar */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-white/30">Race</span>
          <div className="text-sm font-semibold mt-0.5">Bahrain Grand Prix 2024</div>
        </div>
        <div className="h-8 w-px bg-white/10 hidden sm:block" />
        <div>
          <span className="text-[10px] uppercase tracking-widest text-white/30">Laps</span>
          <div className="text-sm font-mono mt-0.5">{totalLaps}</div>
        </div>
        <div className="h-8 w-px bg-white/10 hidden sm:block" />
        <div>
          <span className="text-[10px] uppercase tracking-widest text-white/30">Winner</span>
          <div className="text-sm font-semibold mt-0.5" style={{ color: "#3671C6" }}>VER</div>
        </div>
      </div>

      {/* Tire Strategy */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Fuel className="w-4 h-4 text-racing-amber" />
          <h2 className="text-sm font-semibold">Tire Strategy Overview</h2>
        </div>
        <StrategyChart strategies={mockStrategyData} totalLaps={totalLaps} />
      </div>

      {/* Position Changes + Pit Stops */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Position chart (2 cols) */}
        <div className="xl:col-span-2 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpDown className="w-4 h-4 text-racing-blue" />
            <h2 className="text-sm font-semibold">Position Changes</h2>
          </div>

          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={posData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="lap"
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  tickLine={false}
                />
                <YAxis
                  reversed
                  domain={[1, 8]}
                  ticks={[1, 2, 3, 4, 5, 6, 7, 8]}
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: "Position", angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.15)", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#151820",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    fontFamily: "Fira Code",
                    fontSize: "11px",
                  }}
                  labelFormatter={(v) => `Lap ${v}`}
                />
                {posDrivers.map((d) => (
                  <Line
                    key={d}
                    type="stepAfter"
                    dataKey={d}
                    stroke={posColors[d]}
                    strokeWidth={d === selectedDriver ? 3 : 1.5}
                    strokeOpacity={d === selectedDriver ? 1 : 0.4}
                    dot={false}
                    name={d}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pit Stop Times */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Timer className="w-4 h-4 text-racing-amber" />
            <h2 className="text-sm font-semibold">Pit Stop Times</h2>
          </div>

          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pitStopData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  type="number"
                  domain={[0, 6]}
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}s`}
                />
                <YAxis
                  type="category"
                  dataKey="driver"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Fira Code", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    background: "#151820",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    fontFamily: "Fira Code",
                    fontSize: "11px",
                  }}
                  formatter={(v: number) => `${v.toFixed(1)}s`}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={20}>
                  {pitStopData.map((entry, i) => (
                    <Cell key={i} fill={getTeamColor(entry.team)} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Driver Lap Times */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-racing-blue" />
            <h2 className="text-sm font-semibold">Lap Times — {selectedDriver}</h2>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {["VER", "NOR", "LEC", "HAM", "PIA"].map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDriver(d)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all border",
                  selectedDriver === d
                    ? "border-racing-blue/30 bg-racing-blue/15 text-racing-blue"
                    : "border-white/5 text-white/30 hover:text-white/60"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <LapTimesChart
          data={lapTimes}
          driverCode={selectedDriver}
          teamColor={driverInfo?.driver.teamColor || "#3B82F6"}
        />
      </div>
    </div>
  );
}
