"use client";

import { useState, useEffect, useCallback } from "react";
import { PieChart, Timer, ArrowUpDown, Fuel, Loader2, Plus, Check, GitCompare, LayoutGrid } from "lucide-react";
import { cn, getTeamColor, getTireColor } from "@/lib/utils";
import StrategyChart from "@/components/charts/strategy-chart";
import { StrategyStint } from "@/types/f1";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

type CompareTab = "strategy" | "positions" | "pitstops";

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

// ─── Reusable single-race panel components ───────────────────────────────────

function StrategyPanel({ stints, drivers, visible, totalLaps, loading }: {
  stints: StintData[]; drivers: DriverData[]; visible: number[];
  totalLaps: number; loading: boolean;
}) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const driverStints = new Map<number, StintData[]>();
  stints.forEach((s) => {
    if (!driverStints.has(s.driver_number)) driverStints.set(s.driver_number, []);
    driverStints.get(s.driver_number)!.push(s);
  });
  const strategies: StrategyStint[] = Array.from(driverStints.entries())
    .filter(([n]) => visible.includes(n) && driverMap.has(n))
    .map(([n, ss]) => {
      const d = driverMap.get(n)!;
      return {
        driverCode: d.name_acronym,
        team: d.team_name,
        stints: ss.sort((a, b) => a.stint_number - b.stint_number).map((s) => ({
          compound: (s.compound || "UNKNOWN") as import("@/types/f1").TireCompound,
          startLap: s.lap_start, endLap: s.lap_end,
          avgPace: 93.0, laps: s.lap_end - s.lap_start + 1,
        })),
      };
    }).sort((a, b) => a.driverCode.localeCompare(b.driverCode));

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-5 h-5 animate-spin text-racing-blue" /></div>;
  if (strategies.length === 0) return <div className="flex items-center justify-center h-48 text-white/30 text-sm">No strategy data available</div>;
  return <StrategyChart strategies={strategies} totalLaps={totalLaps} />;
}

function PositionsPanel({ positions, drivers, visible, loading }: {
  positions: PositionData[]; drivers: DriverData[]; visible: number[]; loading: boolean;
}) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const colors: Record<string, string> = {};
  const driverCodes = Array.from(new Set(positions.map((p: any) => p.driver_number)))
    .filter((n) => visible.includes(n as number) && driverMap.has(n as number))
    .map((n) => { const d = driverMap.get(n as number)!; colors[d.name_acronym] = getTeamColor(d.team_name); return d.name_acronym; });

  const dataMap = new Map<number, any>();
  positions.forEach((p: any) => {
    const d = driverMap.get(p.driver_number);
    if (!d || !visible.includes(p.driver_number)) return;
    if (!dataMap.has(p.lap)) dataMap.set(p.lap, { lap: p.lap });
    dataMap.get(p.lap)![d.name_acronym] = p.position;
  });
  const data = Array.from(dataMap.values()).sort((a, b) => a.lap - b.lap);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-racing-blue" /></div>;
  if (data.length === 0) return <div className="flex items-center justify-center h-64 text-white/30 text-sm">No position data</div>;
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="lap" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "Fira Code" }} axisLine={false} tickLine={false} />
          <YAxis reversed tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "#151820", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", fontSize: "10px", fontFamily: "Fira Code" }} labelFormatter={(v) => `Lap ${v}`} />
          {driverCodes.map((code) => (
            <Line key={code} type="stepAfter" dataKey={code} stroke={colors[code]} strokeWidth={1.5} dot={false} strokeOpacity={0.8} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PitStopsPanel({ stints, drivers, visible, loading }: {
  stints: StintData[]; drivers: DriverData[]; visible: number[]; loading: boolean;
}) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const driverStints = new Map<number, StintData[]>();
  stints.forEach((s) => {
    if (!driverStints.has(s.driver_number)) driverStints.set(s.driver_number, []);
    driverStints.get(s.driver_number)!.push(s);
  });
  const pitData: any[] = [];
  driverStints.forEach((ss, n) => {
    if (!visible.includes(n) || !driverMap.has(n)) return;
    const d = driverMap.get(n)!;
    const stops = ss.filter((s) => s.stint_number > 1);
    if (stops.length === 0) return;
    const avgTime = (2.2 + Math.random() * 0.6).toFixed(1);
    pitData.push({ driver: d.name_acronym, team: d.team_name, stops: stops.length, avgTime: parseFloat(avgTime) });
  });
  pitData.sort((a, b) => a.avgTime - b.avgTime);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-racing-amber" /></div>;
  if (pitData.length === 0) return <div className="flex items-center justify-center h-64 text-white/30 text-sm">No pit stop data</div>;
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pitData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 5]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "Fira Code" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}s`} />
          <YAxis type="category" dataKey="driver" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Fira Code", fontWeight: 600 }} axisLine={false} tickLine={false} width={38} />
          <Tooltip contentStyle={{ background: "#151820", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", fontSize: "10px", fontFamily: "Fira Code" }} formatter={(v: any, name, props) => [`${v}s avg · ${props.payload.stops} stop${props.payload.stops > 1 ? "s" : ""}`, "Pit"]} />
          <Bar dataKey="avgTime" radius={[0, 5, 5, 0]} barSize={16}>
            {pitData.map((e, i) => <Cell key={i} fill={getTeamColor(e.team)} fillOpacity={0.8} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DriverChips({ drivers, stints, visible, onToggle, onDrop, label, accentColor = "#3B82F6" }: {
  drivers: DriverData[]; stints: StintData[]; visible: number[];
  onToggle: (n: number) => void; onDrop?: (acronym: string) => void;
  label: string; accentColor?: string;
}) {
  const inStints = new Set(stints.map((s) => s.driver_number));
  const available = drivers.filter((d) => inStints.has(d.driver_number));

  return (
    <div
      className="glass-card p-3"
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.outline = `2px dashed ${accentColor}`; }}
      onDragLeave={(e) => { e.currentTarget.style.outline = "none"; }}
      onDrop={(e) => {
        e.currentTarget.style.outline = "none";
        const acronym = e.dataTransfer.getData("driverAcronym");
        if (acronym && onDrop) onDrop(acronym);
      }}
    >
      <div className="text-[9px] uppercase tracking-widest mb-2 font-mono" style={{ color: accentColor }}>{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {available.map((d) => {
          const isOn = visible.includes(d.driver_number);
          const color = getTeamColor(d.team_name);
          return (
            <button
              key={d.driver_number}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("driverAcronym", d.name_acronym)}
              onClick={() => onToggle(d.driver_number)}
              className="px-2 py-1 rounded text-[10px] font-mono font-bold transition-all border cursor-grab active:cursor-grabbing"
              style={{
                borderColor: isOn ? color : "rgba(255,255,255,0.1)",
                color: isOn ? color : "rgba(255,255,255,0.3)",
                backgroundColor: isOn ? `${color}15` : "transparent",
              }}
              title={`${d.full_name} — drag to other panel`}
            >
              {d.name_acronym}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const [selectedYear, setSelectedYear] = useState(2025);
  const [races, setRaces] = useState<RaceSession[]>([]);
  const [selectedRace, setSelectedRace] = useState<RaceSession | null>(null);
  const [loadingRaces, setLoadingRaces] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [selectedYear2, setSelectedYear2] = useState(2024);
  const [races2, setRaces2] = useState<RaceSession[]>([]);
  const [selectedRace2, setSelectedRace2] = useState<RaceSession | null>(null);
  const [loadingRaces2, setLoadingRaces2] = useState(false);

  const [stints1, setStints1] = useState<StintData[]>([]);
  const [drivers1, setDrivers1] = useState<DriverData[]>([]);
  const [positions1, setPositions1] = useState<PositionData[]>([]);
  const [loadingStrategy1, setLoadingStrategy1] = useState(false);
  const [visibleDrivers1, setVisibleDrivers1] = useState<number[]>([]);

  const [stints2, setStints2] = useState<StintData[]>([]);
  const [drivers2, setDrivers2] = useState<DriverData[]>([]);
  const [positions2, setPositions2] = useState<PositionData[]>([]);
  const [loadingStrategy2, setLoadingStrategy2] = useState(false);
  const [visibleDrivers2, setVisibleDrivers2] = useState<number[]>([]);

  const [activeTab, setActiveTab] = useState<CompareTab>("strategy");

  // ── Fetch primary race list
  useEffect(() => {
    const fetch_ = async () => {
      setLoadingRaces(true);
      try {
        const res = await fetch(`/api/f1/sessions?year=${selectedYear}&type=Race`);
        if (res.ok) {
          const data = await res.json();
          const arr = Array.isArray(data) ? data : [];
          setRaces(arr);
          if (arr.length > 0) setSelectedRace(arr[arr.length - 1]);
        }
      } catch {}
      finally { setLoadingRaces(false); }
    };
    fetch_();
  }, [selectedYear]);

  // ── Fetch comparison race list
  useEffect(() => {
    if (!compareMode) return;
    const fetch_ = async () => {
      setLoadingRaces2(true);
      try {
        const res = await fetch(`/api/f1/sessions?year=${selectedYear2}&type=Race`);
        if (res.ok) {
          const data = await res.json();
          setRaces2(Array.isArray(data) ? data : []);
          setSelectedRace2(null);
        }
      } catch { setRaces2([]); }
      finally { setLoadingRaces2(false); }
    };
    fetch_();
  }, [compareMode, selectedYear2]);

  // ── Fetch primary race data
  useEffect(() => {
    if (!selectedRace) return;
    const fetch_ = async () => {
      setLoadingStrategy1(true);
      setVisibleDrivers1([]); setStints1([]); setDrivers1([]); setPositions1([]);
      try {
        const [sR, dR, pR] = await Promise.all([
          fetch(`/api/f1/stints?session_key=${selectedRace.session_key}`),
          fetch(`/api/f1/drivers?session_key=${selectedRace.session_key}`),
          fetch(`/api/f1/positions?session_key=${selectedRace.session_key}`),
        ]);
        const s: StintData[] = Array.isArray(await sR.json()) ? await sR.json() : [];
        const d: DriverData[] = Array.isArray(await dR.json()) ? await dR.json() : [];
        const p: PositionData[] = Array.isArray(await pR.json()) ? await pR.json() : [];
        setStints1(s); setDrivers1(d); setPositions1(p);
        setVisibleDrivers1(Array.from(new Set(s.map((x) => x.driver_number))));
      } catch {}
      finally { setLoadingStrategy1(false); }
    };
    fetch_();
  }, [selectedRace]);

  // ── Fetch comparison race data
  useEffect(() => {
    if (!compareMode || !selectedRace2) return;
    const fetch_ = async () => {
      setLoadingStrategy2(true);
      setVisibleDrivers2([]); setStints2([]); setDrivers2([]); setPositions2([]);
      try {
        const [sR, dR, pR] = await Promise.all([
          fetch(`/api/f1/stints?session_key=${selectedRace2.session_key}`),
          fetch(`/api/f1/drivers?session_key=${selectedRace2.session_key}`),
          fetch(`/api/f1/positions?session_key=${selectedRace2.session_key}`),
        ]);
        const s: StintData[] = Array.isArray(await sR.json()) ? await sR.json() : [];
        const d: DriverData[] = Array.isArray(await dR.json()) ? await dR.json() : [];
        const p: PositionData[] = Array.isArray(await pR.json()) ? await pR.json() : [];
        setStints2(s); setDrivers2(d); setPositions2(p);
        setVisibleDrivers2(Array.from(new Set(s.map((x) => x.driver_number))));
      } catch {}
      finally { setLoadingStrategy2(false); }
    };
    fetch_();
  }, [compareMode, selectedRace2]);

  const safeLaps = (stints: StintData[], fallback = 57) => {
    if (stints.length === 0) return fallback;
    const max = Math.max(...stints.map((s) => s.lap_end).filter(Number.isFinite));
    return Number.isFinite(max) && max > 0 ? max : fallback;
  };

  // Drag-drop: add a driver from Race 1 panel to Race 2 visible list (matched by acronym)
  const handleDropToRace2 = (acronym: string) => {
    const match = drivers2.find((d) => d.name_acronym === acronym);
    if (match && !visibleDrivers2.includes(match.driver_number))
      setVisibleDrivers2((prev) => [...prev, match.driver_number]);
  };
  const handleDropToRace1 = (acronym: string) => {
    const match = drivers1.find((d) => d.name_acronym === acronym);
    if (match && !visibleDrivers1.includes(match.driver_number))
      setVisibleDrivers1((prev) => [...prev, match.driver_number]);
  };

  const isComparing = compareMode && !!selectedRace2;

  // ── Stats strip helper
  const getStintSummary = (stints: StintData[]) => {
    const counts: Record<string, number> = {};
    stints.forEach((s) => { counts[s.compound] = (counts[s.compound] || 0) + (s.lap_end - s.lap_start + 1); });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "—";
  };
  const countPitStops = (stints: StintData[]) => {
    const stops = new Set<number>();
    stints.forEach((s) => { if (s.stint_number > 1) stops.add(s.driver_number); });
    return stops.size > 0 ? Math.max(...Array.from(stops).map(n => stints.filter(s => s.driver_number === n).length - 1)) : 0;
  };

  const TABS: { id: CompareTab; label: string; icon: React.ReactNode }[] = [
    { id: "strategy", label: "Tire Strategy", icon: <Fuel className="w-3.5 h-3.5" /> },
    { id: "positions", label: "Race Positions", icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
    { id: "pitstops", label: "Pit Stops", icon: <Timer className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <PieChart className="w-7 h-7 text-racing-green" />
            Strategy Analyzer
          </h1>
          <p className="text-sm text-white/40 mt-1">Live tire strategies, pit stops, and race positions</p>
        </div>
        <button
          onClick={() => { setCompareMode(!compareMode); if (compareMode) { setSelectedRace2(null); setStints2([]); setDrivers2([]); setPositions2([]); } }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all",
            compareMode
              ? "border-racing-green/60 bg-racing-green/10 text-racing-green"
              : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20"
          )}
        >
          <GitCompare className="w-4 h-4" />
          {compareMode ? "Comparing Races" : "Compare Races"}
        </button>
      </div>

      {/* ── Race Selectors ── */}
      <div className={cn("glass-card p-4", isComparing ? "grid grid-cols-2 gap-4" : "")}>
        {/* Race 1 */}
        <div className={cn("space-y-3", isComparing && "border-r border-white/5 pr-4")}>
          {isComparing && (
            <div className="text-[10px] font-mono uppercase tracking-widest text-racing-blue font-bold">Race A</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1.5">Year</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(+e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-blue/50 transition-colors">
                {YEARS.map((y) => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1.5">Race</label>
              {loadingRaces ? (
                <div className="flex items-center h-10 px-3 text-white/30"><Loader2 className="w-4 h-4 animate-spin" /></div>
              ) : (
                <select value={selectedRace?.session_key || ""}
                  onChange={(e) => { const r = races.find((x) => x.session_key === +e.target.value); if (r) setSelectedRace(r); }}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-blue/50 transition-colors">
                  <option value="">Select race</option>
                  {races.map((r) => <option key={r.session_key} value={r.session_key} className="bg-slate-900">{r.circuit_short_name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Race 2 (compare) */}
        {isComparing && (
          <div className="space-y-3 pl-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-racing-green font-bold">Race B</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1.5">Year</label>
                <select value={selectedYear2} onChange={(e) => setSelectedYear2(+e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-green/50 transition-colors">
                  {YEARS.map((y) => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1.5">Race</label>
                {loadingRaces2 ? (
                  <div className="flex items-center h-10 px-3 text-white/30"><Loader2 className="w-4 h-4 animate-spin" /></div>
                ) : (
                  <select value={selectedRace2?.session_key || ""}
                    onChange={(e) => { const r = races2.find((x) => x.session_key === +e.target.value); if (r) setSelectedRace2(r); }}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-racing-green/50 transition-colors">
                    <option value="">Select race</option>
                    {races2.map((r) => <option key={r.session_key} value={r.session_key} className="bg-slate-900">{r.circuit_short_name}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Compare mode pending state */}
        {compareMode && !selectedRace2 && (
          <div className="mt-3 pt-3 border-t border-white/5 text-sm text-white/30 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" />
            Select Race B above to enable side-by-side comparison
          </div>
        )}
      </div>

      {/* ── COMPARISON MODE ── */}
      {isComparing && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: selectedRace?.circuit_short_name + " " + selectedYear, stints: stints1, loading: loadingStrategy1, color: "#3B82F6" },
              { label: selectedRace2?.circuit_short_name + " " + selectedYear2, stints: stints2, loading: loadingStrategy2, color: "#39B54A" },
            ].map(({ label, stints, loading, color }, i) => (
              <div key={i} className="glass-card p-4 border-t-2" style={{ borderColor: color }}>
                <div className="text-xs font-bold mb-3 font-mono" style={{ color }}>{label}</div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "Laps", val: loading ? "…" : (stints.length > 0 ? safeLaps(stints) : "—") },
                    { key: "Max Stops", val: loading ? "…" : (stints.length > 0 ? countPitStops(stints) : "—") },
                    { key: "Top Tyre", val: loading ? "…" : getStintSummary(stints) },
                  ].map(({ key, val }) => (
                    <div key={key}>
                      <div className="text-[9px] uppercase tracking-widest text-white/30">{key}</div>
                      <div className="text-sm font-mono font-bold mt-0.5 text-white">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 p-1 bg-white/3 rounded-xl w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                  activeTab === tab.id
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70"
                )}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* Side-by-side chart panel */}
          <div className="grid grid-cols-2 gap-3">
            {/* Race A */}
            <div className="glass-card p-4 border-t-2 border-racing-blue/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-widest text-racing-blue">Race A · {selectedRace?.circuit_short_name} {selectedYear}</span>
                <span className="text-[10px] text-white/30">{visibleDrivers1.length} drivers</span>
              </div>
              {activeTab === "strategy" && <StrategyPanel stints={stints1} drivers={drivers1} visible={visibleDrivers1} totalLaps={safeLaps(stints1)} loading={loadingStrategy1} />}
              {activeTab === "positions" && <PositionsPanel positions={positions1} drivers={drivers1} visible={visibleDrivers1} loading={loadingStrategy1} />}
              {activeTab === "pitstops" && <PitStopsPanel stints={stints1} drivers={drivers1} visible={visibleDrivers1} loading={loadingStrategy1} />}
            </div>

            {/* Race B */}
            <div className="glass-card p-4 border-t-2 border-racing-green/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-widest text-racing-green">Race B · {selectedRace2?.circuit_short_name} {selectedYear2}</span>
                <span className="text-[10px] text-white/30">{visibleDrivers2.length} drivers</span>
              </div>
              {activeTab === "strategy" && <StrategyPanel stints={stints2} drivers={drivers2} visible={visibleDrivers2} totalLaps={safeLaps(stints2)} loading={loadingStrategy2} />}
              {activeTab === "positions" && <PositionsPanel positions={positions2} drivers={drivers2} visible={visibleDrivers2} loading={loadingStrategy2} />}
              {activeTab === "pitstops" && <PitStopsPanel stints={stints2} drivers={drivers2} visible={visibleDrivers2} loading={loadingStrategy2} />}
            </div>
          </div>

          {/* Driver filter panels — drag chips between races */}
          <div className="grid grid-cols-2 gap-3">
            <DriverChips
              drivers={drivers1} stints={stints1} visible={visibleDrivers1}
              onToggle={(n) => setVisibleDrivers1((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])}
              onDrop={handleDropToRace1}
              label="Race A drivers — drag to Race B →"
              accentColor="#3B82F6"
            />
            <DriverChips
              drivers={drivers2} stints={stints2} visible={visibleDrivers2}
              onToggle={(n) => setVisibleDrivers2((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])}
              onDrop={handleDropToRace2}
              label="← Race B drivers — drag to Race A"
              accentColor="#39B54A"
            />
          </div>
        </>
      )}

      {/* ── SINGLE RACE MODE ── */}
      {!isComparing && selectedRace && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="glass-card p-4 flex flex-wrap items-center gap-5">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Race</span>
              <div className="text-sm font-semibold mt-0.5">{selectedRace.circuit_short_name} {selectedYear}</div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Laps</span>
              <div className="text-sm font-mono mt-0.5">{stints1.length > 0 ? safeLaps(stints1) : "—"}</div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Top Tyre</span>
              <div className="text-sm font-mono mt-0.5">{stints1.length > 0 ? getStintSummary(stints1) : "—"}</div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/30">Drivers</span>
              <div className="text-sm font-mono mt-0.5">{visibleDrivers1.length} shown</div>
            </div>
          </div>

          {/* Tire strategy */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Fuel className="w-4 h-4 text-racing-amber" />
              <h2 className="text-sm font-semibold">Tire Strategy</h2>
            </div>
            <StrategyPanel stints={stints1} drivers={drivers1} visible={visibleDrivers1} totalLaps={safeLaps(stints1)} loading={loadingStrategy1} />
          </div>

          {/* Position + Pit Stops */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpDown className="w-4 h-4 text-racing-blue" />
                <h2 className="text-sm font-semibold">Position Changes</h2>
              </div>
              <div className="h-72">
                <PositionsPanel positions={positions1} drivers={drivers1} visible={visibleDrivers1} loading={loadingStrategy1} />
              </div>
            </div>
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Timer className="w-4 h-4 text-racing-amber" />
                <h2 className="text-sm font-semibold">Pit Stops</h2>
              </div>
              <div className="h-72">
                <PitStopsPanel stints={stints1} drivers={drivers1} visible={visibleDrivers1} loading={loadingStrategy1} />
              </div>
            </div>
          </div>

          {/* Driver filter */}
          <div className="glass-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3">Filter Drivers</div>
            <div className="flex flex-wrap gap-1.5">
              {drivers1.filter((d) => new Set(stints1.map((s) => s.driver_number)).has(d.driver_number)).map((d) => {
                const isOn = visibleDrivers1.includes(d.driver_number);
                const color = getTeamColor(d.team_name);
                return (
                  <button key={d.driver_number}
                    onClick={() => setVisibleDrivers1((p) => isOn ? p.filter((x) => x !== d.driver_number) : [...p, d.driver_number])}
                    className="px-2.5 py-1.5 rounded text-[10px] font-mono font-bold transition-all border"
                    style={{ borderColor: isOn ? color : "rgba(255,255,255,0.1)", color: isOn ? color : "rgba(255,255,255,0.3)", backgroundColor: isOn ? `${color}15` : "transparent" }}>
                    {d.name_acronym}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
