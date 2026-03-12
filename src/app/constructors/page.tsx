"use client";

import { useState } from "react";
import { Trophy, TrendingUp, Users } from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";
import { mockConstructorStandings, mock2024Races } from "@/data/mock-data";
import ConstructorBarChart from "@/components/charts/constructor-bar-chart";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

export default function ConstructorsPage() {
  const [selectedTeam, setSelectedTeam] = useState("Red Bull Racing");

  const team = mockConstructorStandings.find((c) => c.team === selectedTeam);
  const raceNames = mock2024Races.map((r) => r.name.replace(" Grand Prix", ""));

  // Build points progression data
  const progressionData = raceNames.map((race, i) => {
    const point: Record<string, any> = { race, round: i + 1 };
    mockConstructorStandings.forEach((c) => {
      point[c.team.replace(" Racing", "")] = c.pointsHistory[i] || 0;
    });
    return point;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Trophy className="w-7 h-7 text-racing-amber" />
          Constructor Championship
        </h1>
        <p className="text-sm text-white/40 mt-1">Team standings, points progression, and analysis</p>
      </div>

      {/* Team Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {mockConstructorStandings.map((c, i) => (
          <button
            key={c.team}
            onClick={() => setSelectedTeam(c.team)}
            className={cn(
              "glass-card-hover p-4 text-left cursor-pointer transition-all",
              selectedTeam === c.team && "ring-1 ring-white/20 bg-white/5"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={cn(
                "pos-badge",
                i === 0 && "p1",
                i === 1 && "p2",
                i === 2 && "p3"
              )}>
                {c.position}
              </span>
              <div
                className="w-8 h-1 rounded-full"
                style={{ backgroundColor: c.teamColor }}
              />
            </div>
            <div className="text-sm font-bold">{c.team}</div>
            <div className="flex items-center justify-between mt-2">
              <div className="font-mono text-xl font-bold" style={{ color: c.teamColor }}>{c.points}</div>
              <div className="text-[10px] text-white/30 font-mono">{c.wins}W</div>
            </div>
            <div className="text-[10px] text-white/30 mt-1">{c.drivers.join(" / ")}</div>
          </button>
        ))}
      </div>

      {/* Points Progression Chart */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-racing-blue" />
          <h2 className="text-sm font-semibold">Points Progression</h2>
        </div>

        <div className="w-full h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={progressionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="race"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#151820",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  fontFamily: "Fira Code",
                  fontSize: "11px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "Fira Code" }} />
              {mockConstructorStandings.map((c) => (
                <Line
                  key={c.team}
                  type="monotone"
                  dataKey={c.team.replace(" Racing", "")}
                  stroke={c.teamColor}
                  strokeWidth={c.team === selectedTeam ? 3 : 1.5}
                  strokeOpacity={c.team === selectedTeam ? 1 : 0.4}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Overall Bar Chart */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-racing-green" />
          <h2 className="text-sm font-semibold">Championship Points</h2>
        </div>
        <ConstructorBarChart constructors={mockConstructorStandings} />
      </div>

      {/* Selected Team Detail */}
      {team && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-2 h-12 rounded-full"
              style={{ backgroundColor: team.teamColor }}
            />
            <div>
              <div className="text-xl font-bold">{team.team}</div>
              <div className="text-sm text-white/40">Constructor Championship Position: P{team.position}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            {[
              { label: "Total Points", value: team.points, color: team.teamColor },
              { label: "Race Wins", value: team.wins, color: "#E10600" },
              { label: "Drivers", value: team.drivers.join(" / "), color: "#3B82F6" },
              { label: "Avg Points/Race", value: (team.points / mock2024Races.length).toFixed(1), color: "#F59E0B" },
            ].map((s) => (
              <div key={s.label} className="bg-white/3 rounded-xl p-4 space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-white/30">{s.label}</span>
                <div className="font-mono text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
