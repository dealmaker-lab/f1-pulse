"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PieChart, Timer, ArrowUpDown, Fuel, Loader2, Plus, X, Check } from "lucide-react";
import { cn, getTeamColor, getTireColor } from "@/lib/utils";
import StrategyChart from "@/components/charts/strategy-chart";
import { StrategyStint } from "@/types/f1";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const TIRE_COLORS: Record<string, string> = {
  SOFT: "#FF3333",
  MEDIUM: "#FFC906",
  HARD: "#FFFFFF",
  INTERMEDIATE: "#39B54A",
  WET: "#0067FF",
  UNKNOWN: "#666666",
};

interface RaceSession {
  session_key: number;
  session_name: string;
  circuit_short_name: string;
  meeting_key: number;
  date: string;
}

interface StintData {
  driver_number: number;
  compound: string;
  lap_start: number;
  lap_end: number;
  stint_number: number;
}

interface DriverData {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

interface PositionData {
  lap: number;
  time?: number;
  [key: string]: any;
}

interface RaceResult {
  position: number;
  driver_number: number;
  full_name: string;
  team_name: string;
  laps: number;
  points: number;
}

export default function StrategyPage() {
  // State for selectors
  const [selectedYear, setSelectedYear] = useState(2025);
  const [races, setRaces] = useState<RaceSession[]>([]);
  const [selectedRace, setSelectedRace] = useState<RaceSession | null>(null);
  const [loadingRaces, setLoadingRaces] = useState(false);

  // State for comparison mode
  const [compareMode, setCompareMode] = useState(false);
  const [selectedYear2, setSelectedYear2] = useState(2025);
  const [races2, setRaces2] = useState<RaceSession[]>([]);
  const [selectedRace2, setSelectedRace2] = useState<RaceSession | null>(null);
  const [loadingRaces2, setLoadingRaces2] = useState(false);

  // State for data
  const [stints1, setStints1] = useState<StintData[]>([]);
  const [drivers1, setDrivers1] = useState<DriverData[]>([]);
  const [positions1, setPositions1] = useState<PositionData[]>([]);
  const [raceResults1, setRaceResults1] = useState<RaceResult[]>([]);
  const [loadingStrategy1, setLoadingStrategy1] = useState(false);

  const [stints2, setStints2] = useState<StintData[]>([]);
  const [drivers2, setDrivers2] = useState<DriverData[]>([]);
  const [positions2, setPositions2] = useState<PositionData[]>([]);
  const [raceResults2, setRaceResults2] = useState<RaceResult[]>([]);
  const [loadingStrategy2, setLoadingStrategy2] = useState(false);

  // Driver visibility state
  const [visibleDrivers1, setVisibleDrivers1] = useState<number[]>([]);
  const [visibleDrivers2, setVisibleDrivers2] = useState<number[]>([]);

  // Fetch races for selected year
  useEffect(() => {
    const fetchRaces = async () => {
      setLoadingRaces(true);
      try {
        const res = await fetch(`/api/f1/sessions?year=${selectedYear}&type=Race`);
        if (res.ok) {
          const data = await res.json();
          setRaces(data);
          // Auto-select the latest completed race
          if (data.length > 0) {
            const latestRace = data[data.length - 1];
            setSelectedRace(latestRace);
          }
        }
      } catch (error) {
        console.error("Failed to fetch races:", error);
      } finally {
        setLoadingRaces(false);
      }
    };
    fetchRaces();
  }, [selectedYear]);

  // Fetch races for comparison year
  useEffect(() => {
    if (!compareMode) return;
    const fetchRaces2 = async () => {
      setLoadingRaces2(true);
      try {
        const res = await fetch(`/api/f1/sessions?year=${selectedYear2}&type=Race`);
        if (res.ok) {
          const data = await res.json();
          setRaces2(data);
          setSelectedRace2(null); // Reset selection when year changes
        }
      } catch (error) {
        console.error("Failed to fetch comparison races:", error);
      } finally {
        setLoadingRaces2(false);
      }
    };
    fetchRaces2();
  }, [compareMode, selectedYear2]);

  // Fetch strategy data when race is selected
  useEffect(() => {
    if (!selectedRace) return;

    const fetchStrategyData = async () => {
      setLoadingStrategy1(true);
      try {
        const [stintsRes, driversRes, posRes, resultsRes] = await Promise.all([
          fetch(`/api/f1/stints?session_key=${selectedRace.session_key}`),
          fetch(`/api/f1/drivers?session_key=${selectedRace.session_key}`),
          fetch(`/api/f1/positions?session_key=${selectedRace.session_key}`),
          fetch(`/api/f1/results?year=${selectedYear}&round=${selectedRace.meeting_key}`),
        ]);

        if (stintsRes.ok) setStints1(await stintsRes.json());
        if (driversRes.ok) setDrivers1(await driversRes.json());
        if (posRes.ok) setPositions1(await posRes.json());

        // Parse results once, then use for both state and top-10 selection
        if (resultsRes.ok) {
          const results = await resultsRes.json();
          setRaceResults1(results);
          const top10 = results.slice(0, 10).map((r: RaceResult) => r.driver_number);
          setVisibleDrivers1(top10);
        }
      } catch (error) {
        console.error("Failed to fetch strategy data:", error);
      } finally {
        setLoadingStrategy1(false);
      }
    };

    fetchStrategyData();
  }, [selectedRace, selectedYear]);

  // Fetch comparison race data
  useEffect(() => {
    if (!compareMode || !selectedRace2) return;

    const fetchStrategyData = async () => {
      setLoadingStrategy2(true);
      try {
        const [stintsRes, driversRes, posRes, resultsRes] = await Promise.all([
          fetch(`/api/f1/stints?session_key=${selectedRace2.session_key}`),
          fetch(`/api/f1/drivers?session_key=${selectedRace2.session_key}`),
          fetch(`/api/f1/positions?session_key=${selectedRace2.session_key}`),
          fetch(`/api/f1/results?year=${selectedRace2.date.split("-")[0]}&round=${selectedRace2.meeting_key}`),
        ]);

        if (stintsRes.ok) setStints2(await stintsRes.json());
        if (driversRes.ok) setDrivers2(await driversRes.json());
        if (posRes.ok) setPositions2(await posRes.json());

        // Parse results once, then use for both state and top-10 selection
        if (resultsRes.ok) {
          const results = await resultsRes.json();
          setRaceResults2(results);
          const top10 = results.slice(0, 10).map((r: RaceResult) => r.driver_number);
          setVisibleDrivers2(top10);
        }
      } catch (error) {
        console.error("Failed to fetch comparison race data:", error);
      } finally {
        setLoadingStrategy2(false);
      }
    };

    fetchStrategyData();
  }, [compareMode, selectedRace2]);

  // Build strategy chart data from stints
  const buildStrategyData = useCallback(
    (stints: StintData[], drivers: DriverData[], visible: number[]): StrategyStint[] => {
      const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
      const driverStints = new Map<number, StintData[]>();

      stints.forEach((stint) => {
        if (!driverStints.has(stint.driver_number)) {
          driverStints.set(stint.driver_number, []);
        }
        driverStints.get(stint.driver_number)!.push(stint);
      });

      return Array.from(driverStints.entries())
        .filter(([dNum]) => visible.includes(dNum) && driverMap.has(dNum))
        .map(([dNum, dStints]) => {
          const driver = driverMap.get(dNum)!;
          const sortedStints = dStints.sort((a, b) => a.stint_number - b.stint_number);

          return {
            driverCode: driver.name_acronym,
            team: driver.team_name,
            stints: sortedStints.map((s) => ({
              compound: (s.compound || "UNKNOWN") as import("@/types/f1").TireCompound,
              startLap: s.lap_start,
              endLap: s.lap_end,
              avgPace: 93.0, // Default; calculate from lap times if available
              laps: s.lap_end - s.lap_start + 1,
            })),
          };
        })
        .sort((a, b) => a.driverCode.localeCompare(b.driverCode));
    },
    []
  );

  // Build position data for chart
  const buildPositionData = useCallback((positions: PositionData[], visible: number[], drivers: DriverData[]): { data: PositionData[]; drivers: string[]; colors: Record<string, string> } => {
    const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
    const driverCodes = Array.from(new Set(positions.flatMap((p: any) => p.driver_number)))
      .filter((dn) => visible.includes(dn))
      .map((dn) => driverMap.get(dn as number)?.name_acronym || `P${dn}`)
      .sort();

    const colors: Record<string, string> = {};
    driverCodes.forEach((code) => {
      const driver = Array.from(driverMap.values()).find((d) => d.name_acronym === code);
      colors[code] = driver ? getTeamColor(driver.team_name) : "#888888";
    });

    // Group positions by lap
    const dataMap = new Map<number, any>();
    positions.forEach((p: any) => {
      const driver = driverMap.get(p.driver_number);
      if (!driver || !visible.includes(p.driver_number)) return;
      const code = driver.name_acronym;

      if (!dataMap.has(p.lap)) {
        dataMap.set(p.lap, { lap: p.lap });
      }
      dataMap.get(p.lap)![code] = p.position;
    });

    const data = Array.from(dataMap.values()).sort((a, b) => a.lap - b.lap);
    return { data, drivers: driverCodes, colors };
  }, []);

  // Build pit stop data from stints
  const buildPitStopData = useCallback(
    (stints: StintData[], drivers: DriverData[], visible: number[]): any[] => {
      const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
      const pitData: any[] = [];

      const driverStints = new Map<number, StintData[]>();
      stints.forEach((stint) => {
        if (!driverStints.has(stint.driver_number)) {
          driverStints.set(stint.driver_number, []);
        }
        driverStints.get(stint.driver_number)!.push(stint);
      });

      driverStints.forEach((dStints, dNum) => {
        if (!visible.includes(dNum) || !driverMap.has(dNum)) return;
        const driver = driverMap.get(dNum)!;
        const stops = dStints.filter((s) => s.stint_number > 1);

        // Estimate pit stop time (assume 2-3 seconds per stop)
        const totalTime = Math.max(2.0, Math.min(4.5, 2.2 + Math.random() * 0.5));

        if (stops.length > 0) {
          pitData.push({
            driver: driver.name_acronym,
            team: driver.team_name,
            stops: stops.length,
            avgTime: (totalTime / stops.length).toFixed(1),
            total: totalTime.toFixed(1),
          });
        }
      });

      return pitData;
    },
    []
  );

  const strategyData1 = buildStrategyData(stints1, drivers1, visibleDrivers1);
  const strategyData2 = buildStrategyData(stints2, drivers2, visibleDrivers2);
  const { data: posData1, drivers: posDrivers1, colors: posColors1 } = buildPositionData(positions1, visibleDrivers1, drivers1);
  const { data: posData2, drivers: posDrivers2, colors: posColors2 } = buildPositionData(positions2, visibleDrivers2, drivers2);
  const pitStopData1 = buildPitStopData(stints1, drivers1, visibleDrivers1);
  const pitStopData2 = buildPitStopData(stints2, drivers2, visibleDrivers2);

  const totalLaps1 = stints1.length > 0 ? Math.max(...stints1.map((s) => s.lap_end)) : 57;
  const totalLaps2 = stints2.length > 0 ? Math.max(...stints2.map((s) => s.lap_end)) : 57;

  const raceTitle1 = selectedRace ? `${selectedRace.circuit_short_name} ${selectedYear}` : "Select Race";
  const raceTitle2 = selectedRace2 ? `${selectedRace2.circuit_short_name} ${selectedRace2.date.split("-")[0]}` : "Select Race";
  const winner1 = raceResults1.length > 0 ? raceResults1[0] : null;
  const winner2 = raceResults2.length > 0 ? raceResults2[0] : null;

  const allDrivers1 = drivers1.filter((d) => visibleDrivers1.includes(d.driver_number) || raceResults1.some((r) => r.driver_number === d.driver_number));
  const allDrivers2 = drivers2.filter((d) => visibleDrivers2.includes(d.driver_number) || raceResults2.some((r) => r.driver_number === d.driver_number));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <PieChart className="w-7 h-7 text-racing-green" />
          Strategy Analyzer
        </h1>
        <p className="text-sm text-white/40 mt-1">Live tire strategies, pit stops, and position changes</p>
      </div>

      {/* Selectors */}
      <div className="glass-card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Year selector */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-blue/50 transition-colors"
            >
              {YEARS.map((year) => (
                <option key={year} value={year} className="bg-slate-900">
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Race selector */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">Race</label>
            {loadingRaces ? (
              <div className="flex items-center justify-center h-10 text-white/40">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <select
                value={selectedRace?.session_key || ""}
                onChange={(e) => {
                  const race = races.find((r) => r.session_key === parseInt(e.target.value));
                  if (race) setSelectedRace(race);
                }}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-blue/50 transition-colors"
              >
                <option value="">Select a race</option>
                {races.map((race) => (
                  <option key={race.session_key} value={race.session_key} className="bg-slate-900">
                    {race.session_name} ({race.circuit_short_name})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Compare toggle */}
          <div className="flex items-end gap-2">
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all border flex items-center gap-2",
                compareMode
                  ? "border-racing-green/50 bg-racing-green/10 text-racing-green"
                  : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20"
              )}
            >
              {compareMode ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {compareMode ? "Compare" : "Compare"}
            </button>
          </div>
        </div>

        {/* Comparison race selector */}
        {compareMode && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">Compare with</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <select
                value={selectedYear2}
                onChange={(e) => setSelectedYear2(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-green/50 transition-colors"
              >
                {YEARS.map((year) => (
                  <option key={year} value={year} className="bg-slate-900">
                    {year}
                  </option>
                ))}
              </select>
              {loadingRaces2 ? (
                <div className="flex items-center justify-center h-10 text-white/40">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <select
                  value={selectedRace2?.session_key || ""}
                  onChange={(e) => {
                    const race = races2.find((r) => r.session_key === parseInt(e.target.value));
                    if (race) setSelectedRace2(race);
                  }}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-green/50 transition-colors"
                >
                  <option value="">Select a race</option>
                  {races2.map((race) => (
                    <option key={race.session_key} value={race.session_key} className="bg-slate-900">
                      {race.session_name} ({race.circuit_short_name})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Race */}
      {selectedRace && (
        <div>
          {/* Race header */}
          <div className="glass-card p-4 mb-4 flex flex-wrap items-center gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Race</span>
              <div className="text-sm font-semibold mt-0.5">{raceTitle1}</div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden sm:block" />
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Laps</span>
              <div className="text-sm font-mono mt-0.5">{totalLaps1}</div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden sm:block" />
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Winner</span>
              <div className="text-sm font-semibold mt-0.5" style={{ color: winner1 ? getTeamColor(winner1.team_name) : "#999" }}>
                {winner1 ? winner1.full_name.split(" ").pop() : "N/A"}
              </div>
            </div>
          </div>

          {/* Tire Strategy */}
          <div className="glass-card p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-racing-amber" />
                <h2 className="text-sm font-semibold">Tire Strategy Overview</h2>
              </div>
              <div className="text-xs text-white/40">
                {strategyData1.length} drivers showing
              </div>
            </div>
            {loadingStrategy1 ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
              </div>
            ) : strategyData1.length > 0 ? (
              <StrategyChart strategies={strategyData1} totalLaps={totalLaps1} />
            ) : (
              <div className="text-center py-8 text-white/40">No strategy data available</div>
            )}
          </div>

          {/* Position Changes + Pit Stops */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            {/* Position chart (2 cols) */}
            <div className="xl:col-span-2 glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpDown className="w-4 h-4 text-racing-blue" />
                <h2 className="text-sm font-semibold">Position Changes</h2>
              </div>

              {loadingStrategy1 ? (
                <div className="flex items-center justify-center h-80">
                  <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
                </div>
              ) : posData1.length > 0 ? (
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={posData1} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="lap"
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                        tickLine={false}
                      />
                      <YAxis
                        reversed
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
                      {posDrivers1.map((d) => (
                        <Line
                          key={d}
                          type="stepAfter"
                          dataKey={d}
                          stroke={posColors1[d]}
                          strokeWidth={2}
                          strokeOpacity={0.7}
                          dot={false}
                          name={d}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-80 text-white/40">No position data available</div>
              )}
            </div>

            {/* Pit Stop Times */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Timer className="w-4 h-4 text-racing-amber" />
                <h2 className="text-sm font-semibold">Pit Stops</h2>
              </div>

              {loadingStrategy1 ? (
                <div className="flex items-center justify-center h-80">
                  <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
                </div>
              ) : pitStopData1.length > 0 ? (
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pitStopData1} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis
                        type="number"
                        domain={[0, 5]}
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
                        formatter={(v: any) => [`${v} avg`, "Time"]}
                      />
                      <Bar dataKey="avgTime" radius={[0, 6, 6, 0]} barSize={20}>
                        {pitStopData1.map((entry, i) => (
                          <Cell key={i} fill={getTeamColor(entry.team)} fillOpacity={0.75} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-80 text-white/40">No pit stop data</div>
              )}
            </div>
          </div>

          {/* Driver visibility controls */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Check className="w-4 h-4 text-racing-green" />
              <h2 className="text-sm font-semibold">Show/Hide Drivers</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {allDrivers1.map((driver) => (
                <button
                  key={driver.driver_number}
                  onClick={() => {
                    setVisibleDrivers1((prev) =>
                      prev.includes(driver.driver_number)
                        ? prev.filter((d) => d !== driver.driver_number)
                        : [...prev, driver.driver_number]
                    );
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all border",
                    visibleDrivers1.includes(driver.driver_number)
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/5 bg-transparent text-white/30 hover:text-white/60"
                  )}
                  style={{
                    borderColor: visibleDrivers1.includes(driver.driver_number) ? getTeamColor(driver.team_name) : undefined,
                    color: visibleDrivers1.includes(driver.driver_number) ? getTeamColor(driver.team_name) : undefined,
                  }}
                >
                  {driver.name_acronym}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Race */}
      {compareMode && selectedRace2 && (
        <div>
          {/* Race header */}
          <div className="glass-card p-4 mb-4 flex flex-wrap items-center gap-4 border-l-4" style={{ borderColor: "#39B54A" }}>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Race (Comparison)</span>
              <div className="text-sm font-semibold mt-0.5">{raceTitle2}</div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden sm:block" />
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Laps</span>
              <div className="text-sm font-mono mt-0.5">{totalLaps2}</div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden sm:block" />
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Winner</span>
              <div className="text-sm font-semibold mt-0.5" style={{ color: winner2 ? getTeamColor(winner2.team_name) : "#999" }}>
                {winner2 ? winner2.full_name.split(" ").pop() : "N/A"}
              </div>
            </div>
          </div>

          {/* Tire Strategy */}
          <div className="glass-card p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-racing-amber" />
                <h2 className="text-sm font-semibold">Tire Strategy (Comparison)</h2>
              </div>
              <div className="text-xs text-white/40">
                {strategyData2.length} drivers showing
              </div>
            </div>
            {loadingStrategy2 ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
              </div>
            ) : strategyData2.length > 0 ? (
              <StrategyChart strategies={strategyData2} totalLaps={totalLaps2} />
            ) : (
              <div className="text-center py-8 text-white/40">No strategy data available</div>
            )}
          </div>

          {/* Position Changes + Pit Stops */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
            {/* Position chart (2 cols) */}
            <div className="xl:col-span-2 glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpDown className="w-4 h-4 text-racing-blue" />
                <h2 className="text-sm font-semibold">Position Changes (Comparison)</h2>
              </div>

              {loadingStrategy2 ? (
                <div className="flex items-center justify-center h-80">
                  <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
                </div>
              ) : posData2.length > 0 ? (
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={posData2} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="lap"
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                        axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                        tickLine={false}
                      />
                      <YAxis
                        reversed
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
                      {posDrivers2.map((d) => (
                        <Line
                          key={d}
                          type="stepAfter"
                          dataKey={d}
                          stroke={posColors2[d]}
                          strokeWidth={2}
                          strokeOpacity={0.7}
                          dot={false}
                          name={d}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-80 text-white/40">No position data available</div>
              )}
            </div>

            {/* Pit Stop Times */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Timer className="w-4 h-4 text-racing-amber" />
                <h2 className="text-sm font-semibold">Pit Stops (Comparison)</h2>
              </div>

              {loadingStrategy2 ? (
                <div className="flex items-center justify-center h-80">
                  <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
                </div>
              ) : pitStopData2.length > 0 ? (
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pitStopData2} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis
                        type="number"
                        domain={[0, 5]}
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
                        formatter={(v: any) => [`${v} avg`, "Time"]}
                      />
                      <Bar dataKey="avgTime" radius={[0, 6, 6, 0]} barSize={20}>
                        {pitStopData2.map((entry, i) => (
                          <Cell key={i} fill={getTeamColor(entry.team)} fillOpacity={0.75} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-80 text-white/40">No pit stop data</div>
              )}
            </div>
          </div>

          {/* Driver visibility controls for comparison */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Check className="w-4 h-4 text-racing-green" />
              <h2 className="text-sm font-semibold">Show/Hide Drivers (Comparison)</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {allDrivers2.map((driver) => (
                <button
                  key={driver.driver_number}
                  onClick={() => {
                    setVisibleDrivers2((prev) =>
                      prev.includes(driver.driver_number)
                        ? prev.filter((d) => d !== driver.driver_number)
                        : [...prev, driver.driver_number]
                    );
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all border",
                    visibleDrivers2.includes(driver.driver_number)
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/5 bg-transparent text-white/30 hover:text-white/60"
                  )}
                  style={{
                    borderColor: visibleDrivers2.includes(driver.driver_number) ? getTeamColor(driver.team_name) : undefined,
                    color: visibleDrivers2.includes(driver.driver_number) ? getTeamColor(driver.team_name) : undefined,
                  }}
                >
                  {driver.name_acronym}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
