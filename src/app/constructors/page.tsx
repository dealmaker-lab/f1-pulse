"use client";

import { useState, useEffect } from "react";
import { Trophy, TrendingUp, Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell,
} from "recharts";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

interface ConstructorStanding {
  position: number;
  points: number;
  wins: number;
  team: string;
  constructorId: string;
  teamColor: string;
  nationality: string;
  drivers?: string[];
}

interface ProgressionData {
  raceNames: string[];
  constructors: { team: string; teamColor: string; constructorId: string; points: number[] }[];
}

export default function ConstructorsPage() {
  const [selectedYear, setSelectedYear] = useState(2025);
  const [standings, setStandings] = useState<ConstructorStanding[]>([]);
  const [progression, setProgression] = useState<ProgressionData | null>(null);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [loadingProgression, setLoadingProgression] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  // Fetch standings
  useEffect(() => {
    const fetchStandings = async () => {
      setLoadingStandings(true);
      setStandings([]);
      setSelectedTeam(null);
      try {
        const res = await fetch(`/api/f1/standings/constructors?year=${selectedYear}`);
        if (res.ok) {
          const data = await res.json();
          const arr: ConstructorStanding[] = Array.isArray(data) ? data : [];
          setStandings(arr);
          if (arr.length > 0) setSelectedTeam(arr[0].team);
        }
      } catch (e) {
        console.error("Failed to fetch constructor standings:", e);
      } finally {
        setLoadingStandings(false);
      }
    };
    fetchStandings();
  }, [selectedYear]);

  // Fetch points progression (from results API, compute per-constructor cumulative points)
  useEffect(() => {
    const fetchProgression = async () => {
      setLoadingProgression(true);
      setProgression(null);
      try {
        const res = await fetch(`/api/f1/results?year=${selectedYear}`);
        if (!res.ok) return;
        const allRaces = await res.json();
        if (!Array.isArray(allRaces) || allRaces.length === 0) return;

        // Build constructor cumulative points from race results
        const raceNames: string[] = [];
        const constructorCumulative: Record<string, { teamColor: string; constructorId: string; points: number[] }> = {};

        allRaces.forEach((race: any, raceIdx: number) => {
          const shortName = (race.raceName || `Round ${race.round}`)
            .replace(" Grand Prix", "")
            .replace("Grand Prix", "");
          raceNames.push(shortName);

          // Accumulate points for each constructor this race
          const raceConstructorPts: Record<string, number> = {};
          (race.results || []).forEach((r: any) => {
            const team = r.driver?.team || "";
            const constructorId = team.toLowerCase().replace(/\s+/g, "_");
            const pts = r.points || 0;
            raceConstructorPts[team] = (raceConstructorPts[team] || 0) + pts;

            if (!constructorCumulative[team]) {
              constructorCumulative[team] = {
                teamColor: r.driver?.teamColor || "#888888",
                constructorId,
                points: new Array(raceIdx).fill(0),
              };
            }
          });

          // Update cumulative points for all known constructors
          Object.keys(constructorCumulative).forEach((team) => {
            const prev = raceIdx > 0
              ? (constructorCumulative[team].points[raceIdx - 1] || 0)
              : 0;
            const earned = raceConstructorPts[team] || 0;
            constructorCumulative[team].points[raceIdx] = prev + earned;
          });
        });

        // Sort by final points
        const sortedConstructors = Object.entries(constructorCumulative)
          .sort(([, a], [, b]) => {
            const lastA = a.points[a.points.length - 1] || 0;
            const lastB = b.points[b.points.length - 1] || 0;
            return lastB - lastA;
          })
          .map(([team, data]) => ({ team, ...data }));

        setProgression({ raceNames, constructors: sortedConstructors });
      } catch (e) {
        console.error("Failed to fetch progression:", e);
      } finally {
        setLoadingProgression(false);
      }
    };
    fetchProgression();
  }, [selectedYear]);

  const team = standings.find((c) => c.team === selectedTeam);

  // Build chart data for progression line chart
  const progressionChartData = progression?.raceNames.map((race, i) => {
    const point: Record<string, any> = { race };
    progression.constructors.forEach((c) => {
      point[c.team] = c.points[i] || 0;
    });
    return point;
  }) || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Trophy className="w-7 h-7 text-racing-amber" />
            Constructor Championship
          </h1>
          <p className="text-sm text-f1-muted mt-1">Team standings, points progression, and analysis</p>
        </div>

        {/* Year selector */}
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="px-4 py-2 bg-[var(--f1-hover)] border border-[var(--f1-border)] rounded-lg text-sm text-f1 outline-none focus:border-racing-amber/50 transition-colors font-mono"
        >
          {YEARS.map((y) => (
            <option key={y} value={y} className="bg-slate-900">{y} Season</option>
          ))}
        </select>
      </div>

      {/* Constructor Cards */}
      {loadingStandings ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-racing-amber" />
        </div>
      ) : standings.length === 0 ? (
        <div className="glass-card p-8 text-center text-f1-sub">
          No constructor standings data available for {selectedYear}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {standings.slice(0, 10).map((c, i) => (
            <button
              key={c.team}
              onClick={() => setSelectedTeam(c.team)}
              className={cn(
                "glass-card-hover p-4 text-left cursor-pointer transition-all",
                selectedTeam === c.team && "ring-1 ring-[var(--f1-border)] bg-[var(--f1-hover)]"
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
                <div className="w-8 h-1 rounded-full" style={{ backgroundColor: c.teamColor }} />
              </div>
              <div className="text-sm font-bold leading-tight">{c.team}</div>
              <div className="flex items-center justify-between mt-2">
                <div className="font-mono text-xl font-bold" style={{ color: c.teamColor }}>{c.points}</div>
                <div className="text-[10px] text-f1-muted font-mono">{c.wins}W</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Points Progression Chart */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-racing-blue" />
          <h2 className="text-sm font-semibold">Points Progression</h2>
          {loadingProgression && <Loader2 className="w-4 h-4 animate-spin text-f1-muted ml-auto" />}
        </div>

        {!loadingProgression && progressionChartData.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-f1-sub text-sm">
            No progression data available for {selectedYear}
          </div>
        ) : (
          <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressionChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                {progression?.constructors.map((c) => (
                  <Line
                    key={c.team}
                    type="monotone"
                    dataKey={c.team}
                    stroke={c.teamColor}
                    strokeWidth={selectedTeam === c.team ? 3 : 1.5}
                    strokeOpacity={selectedTeam === c.team ? 1 : 0.4}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Championship Points Bar Chart */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-racing-green" />
          <h2 className="text-sm font-semibold">Championship Points</h2>
        </div>
        {loadingStandings ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-5 h-5 animate-spin text-racing-green" />
          </div>
        ) : (
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={standings} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <XAxis
                  type="number"
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="team"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Fira Code" }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    background: "#151820",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    fontFamily: "Fira Code",
                    fontSize: "11px",
                  }}
                  formatter={(v: any) => [`${v} pts`, "Points"]}
                />
                <Bar dataKey="points" radius={[0, 6, 6, 0]} barSize={18}>
                  {standings.map((c, i) => (
                    <Cell
                      key={i}
                      fill={c.teamColor}
                      fillOpacity={selectedTeam === c.team ? 1 : 0.55}
                      cursor="pointer"
                      onClick={() => setSelectedTeam(c.team)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Selected Team Detail */}
      {team && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-2 h-12 rounded-full" style={{ backgroundColor: team.teamColor }} />
            <div>
              <div className="text-xl font-bold">{team.team}</div>
              <div className="text-sm text-f1-sub">
                Constructor Championship Position: P{team.position} · {selectedYear} Season
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
            {[
              { label: "Total Points", value: team.points, color: team.teamColor },
              { label: "Race Wins", value: team.wins, color: "#E10600" },
              { label: "Nationality", value: team.nationality || "—", color: "#3B82F6" },
            ].map((s) => (
              <div key={s.label} className="bg-[var(--f1-hover)] rounded-xl p-4 space-y-1">
                <span className="text-[10px] uppercase tracking-widest text-f1-muted">{s.label}</span>
                <div className="font-mono text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
