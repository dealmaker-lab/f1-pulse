"use client";

import { useState } from "react";
import { Users, Trophy, Flag, Timer, TrendingUp, ChevronDown } from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";
import { mockDriverStandings, mock2024Races } from "@/data/mock-data";
import ChampionshipChart from "@/components/charts/championship-chart";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from "recharts";

// Driver profile data
function getDriverProfile(code: string) {
  const profiles: Record<string, { age: number; podiums: number; poles: number; wins: number; championships: number; bestFinish: string; }> = {
    VER: { age: 27, podiums: 111, poles: 40, wins: 63, championships: 4, bestFinish: "1st (x63)" },
    NOR: { age: 25, podiums: 28, poles: 8, wins: 4, championships: 0, bestFinish: "1st (x4)" },
    LEC: { age: 27, podiums: 38, poles: 24, wins: 8, championships: 0, bestFinish: "1st (x8)" },
    PIA: { age: 23, podiums: 12, poles: 2, wins: 2, championships: 0, bestFinish: "1st (x2)" },
    SAI: { age: 30, podiums: 23, poles: 6, wins: 4, championships: 0, bestFinish: "1st (x4)" },
    HAM: { age: 40, podiums: 202, poles: 104, wins: 105, championships: 7, bestFinish: "1st (x105)" },
    RUS: { age: 27, podiums: 16, poles: 5, wins: 3, championships: 0, bestFinish: "1st (x3)" },
    ALO: { age: 43, podiums: 106, poles: 22, wins: 32, championships: 2, bestFinish: "1st (x32)" },
  };
  return profiles[code] || { age: 0, podiums: 0, poles: 0, wins: 0, championships: 0, bestFinish: "-" };
}

// Radar chart data for driver comparison
function getRadarData(code1: string, code2: string) {
  const p1 = getDriverProfile(code1);
  const p2 = getDriverProfile(code2);

  // Normalize to 0-100 scale
  const normalize = (val: number, max: number) => Math.min(100, (val / max) * 100);

  return [
    { stat: "Wins", [code1]: normalize(p1.wins, 110), [code2]: normalize(p2.wins, 110) },
    { stat: "Poles", [code1]: normalize(p1.poles, 110), [code2]: normalize(p2.poles, 110) },
    { stat: "Podiums", [code1]: normalize(p1.podiums, 210), [code2]: normalize(p2.podiums, 210) },
    { stat: "WDC", [code1]: normalize(p1.championships, 7), [code2]: normalize(p2.championships, 7) },
    { stat: "Season Pts", [code1]: normalize(mockDriverStandings.find(d => d.driver.code === code1)?.points || 0, 440), [code2]: normalize(mockDriverStandings.find(d => d.driver.code === code2)?.points || 0, 440) },
    { stat: "Consistency", [code1]: 85 + Math.random() * 15, [code2]: 75 + Math.random() * 15 },
  ];
}

export default function DriversPage() {
  const [selectedDriver, setSelectedDriver] = useState("VER");
  const [compareDriver, setCompareDriver] = useState("HAM");

  const driver = mockDriverStandings.find((d) => d.driver.code === selectedDriver);
  const profile = getDriverProfile(selectedDriver);
  const radarData = getRadarData(selectedDriver, compareDriver);

  if (!driver) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Users className="w-7 h-7 text-racing-amber" />
          Driver Profiles
        </h1>
        <p className="text-sm text-white/40 mt-1">Career stats, performance, and head-to-head comparison</p>
      </div>

      {/* Driver Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {mockDriverStandings.map((d) => (
          <button
            key={d.driver.code}
            onClick={() => setSelectedDriver(d.driver.code)}
            className={cn(
              "glass-card-hover p-3 text-center cursor-pointer transition-all",
              selectedDriver === d.driver.code && "ring-1 ring-white/20 bg-white/5"
            )}
          >
            <div
              className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center text-sm font-mono font-bold mb-2"
              style={{ backgroundColor: `${d.driver.teamColor}20`, color: d.driver.teamColor }}
            >
              {d.driver.number}
            </div>
            <div className="text-xs font-bold">{d.driver.code}</div>
            <div className="text-[9px] text-white/30 mt-0.5">{d.driver.team.replace(" Racing", "")}</div>
          </button>
        ))}
      </div>

      {/* Selected Driver Profile */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Main card */}
        <div className="glass-card p-6 xl:col-span-1">
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-mono font-black"
              style={{ backgroundColor: `${driver.driver.teamColor}20`, color: driver.driver.teamColor }}
            >
              {driver.driver.number}
            </div>
            <div>
              <div className="text-xl font-bold">{driver.driver.name}</div>
              <div className="text-sm text-white/40">{driver.driver.team}</div>
              <div className="text-xs text-white/30 font-mono mt-0.5">{driver.driver.nationality} &middot; {profile.age} yrs</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Championships", value: profile.championships, icon: Trophy, color: "#F59E0B" },
              { label: "Race Wins", value: profile.wins, icon: Flag, color: "#E10600" },
              { label: "Podiums", value: profile.podiums, icon: TrendingUp, color: "#00D2BE" },
              { label: "Pole Positions", value: profile.poles, icon: Timer, color: "#3B82F6" },
            ].map((s) => (
              <div key={s.label} className="bg-white/3 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <s.icon className="w-3 h-3" style={{ color: s.color }} />
                  <span className="text-[10px] uppercase tracking-widest text-white/30">{s.label}</span>
                </div>
                <div className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Season 2024 stats */}
          <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">2024 Season</h3>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/50">Championship Position</span>
              <span className="font-mono font-bold text-lg">P{driver.position}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/50">Points</span>
              <span className="font-mono font-bold" style={{ color: driver.driver.teamColor }}>{driver.points}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/50">Wins / Podiums</span>
              <span className="font-mono font-bold">{driver.wins}W / {driver.podiums}P</span>
            </div>
          </div>
        </div>

        {/* Radar comparison */}
        <div className="glass-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Head-to-Head Comparison</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono" style={{ color: getTeamColor(driver.driver.team) }}>{selectedDriver}</span>
              <span className="text-white/20 text-xs">vs</span>
              <select
                value={compareDriver}
                onChange={(e) => setCompareDriver(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white/70 cursor-pointer appearance-none"
              >
                {mockDriverStandings.filter(d => d.driver.code !== selectedDriver).map((d) => (
                  <option key={d.driver.code} value={d.driver.code}>{d.driver.code}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis
                  dataKey="stat"
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Fira Code" }}
                />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar
                  name={selectedDriver}
                  dataKey={selectedDriver}
                  stroke={getTeamColor(driver.driver.team)}
                  fill={getTeamColor(driver.driver.team)}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Radar
                  name={compareDriver}
                  dataKey={compareDriver}
                  stroke={getTeamColor(mockDriverStandings.find(d => d.driver.code === compareDriver)?.driver.team || "")}
                  fill={getTeamColor(mockDriverStandings.find(d => d.driver.code === compareDriver)?.driver.team || "")}
                  fillOpacity={0.15}
                  strokeWidth={2}
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
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Championship Progress for selected driver */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold mb-4">Points Progression — {selectedDriver} vs {compareDriver}</h2>
        <ChampionshipChart
          drivers={mockDriverStandings.filter((d) => d.driver.code === selectedDriver || d.driver.code === compareDriver)}
          races={mock2024Races.map((r) => r.name)}
        />
      </div>
    </div>
  );
}
