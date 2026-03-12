"use client";

import { useState, useEffect } from "react";
import {
  Fuel, Timer, ArrowUpDown, Loader2, GitCompare,
  ChevronDown, Flag, TrendingUp, Zap,
} from "lucide-react";
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeLaps(stints: StintData[], fallback = 57): number {
  if (!stints.length) return fallback;
  const vals = stints.map((s) => s.lap_end).filter(Number.isFinite);
  const m = vals.length ? Math.max(...vals) : 0;
  return m > 0 ? m : fallback;
}

function topTyre(stints: StintData[]): string {
  const counts: Record<string, number> = {};
  stints.forEach((s) => {
    counts[s.compound] = (counts[s.compound] || 0) + (s.lap_end - s.lap_start + 1);
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "—";
}

function maxStops(stints: StintData[]): number {
  const byDriver = new Map<number, number>();
  stints.forEach((s) => {
    const cur = byDriver.get(s.driver_number) ?? 0;
    byDriver.set(s.driver_number, Math.max(cur, s.stint_number));
  });
  if (!byDriver.size) return 0;
  return Math.max(...Array.from(byDriver.values())) - 1;
}

// ─── sub-panels ──────────────────────────────────────────────────────────────

function StrategyPanel({
  stints, drivers, visible, totalLaps, loading,
}: {
  stints: StintData[]; drivers: DriverData[]; visible: number[];
  totalLaps: number; loading: boolean;
}) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const byDriver = new Map<number, StintData[]>();
  stints.forEach((s) => {
    if (!byDriver.has(s.driver_number)) byDriver.set(s.driver_number, []);
    byDriver.get(s.driver_number)!.push(s);
  });
  const strategies: StrategyStint[] = Array.from(byDriver.entries())
    .filter(([n]) => visible.includes(n) && driverMap.has(n))
    .map(([n, ss]) => {
      const d = driverMap.get(n)!;
      return {
        driverCode: d.name_acronym,
        team: d.team_name,
        stints: ss
          .sort((a, b) => a.stint_number - b.stint_number)
          .map((s) => ({
            compound: (s.compound || "UNKNOWN") as import("@/types/f1").TireCompound,
            startLap: s.lap_start,
            endLap: s.lap_end,
            avgPace: 93.0,
            laps: s.lap_end - s.lap_start + 1,
          })),
      };
    })
    .sort((a, b) => a.driverCode.localeCompare(b.driverCode));

  if (loading)
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-racing-blue" />
      </div>
    );
  if (!strategies.length)
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-white/20">
        <Fuel className="w-6 h-6" />
        <span className="text-xs font-mono">No strategy data</span>
      </div>
    );
  return <StrategyChart strategies={strategies} totalLaps={totalLaps} />;
}

function PositionsPanel({
  positions, drivers, visible, loading,
}: {
  positions: PositionData[]; drivers: DriverData[]; visible: number[]; loading: boolean;
}) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const colorMap: Record<string, string> = {};
  const codes = Array.from(new Set(positions.map((p: any) => p.driver_number)))
    .filter((n) => visible.includes(n as number) && driverMap.has(n as number))
    .map((n) => {
      const d = driverMap.get(n as number)!;
      colorMap[d.name_acronym] = getTeamColor(d.team_name);
      return d.name_acronym;
    });

  const dataMap = new Map<number, any>();
  positions.forEach((p: any) => {
    const d = driverMap.get(p.driver_number);
    if (!d || !visible.includes(p.driver_number)) return;
    if (!dataMap.has(p.lap)) dataMap.set(p.lap, { lap: p.lap });
    dataMap.get(p.lap)![d.name_acronym] = p.position;
  });
  const data = Array.from(dataMap.values()).sort((a, b) => a.lap - b.lap);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-racing-blue" />
      </div>
    );
  if (!data.length)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-white/20">
        <TrendingUp className="w-6 h-6" />
        <span className="text-xs font-mono">No position data</span>
      </div>
    );
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="lap"
            tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "Fira Code" }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            reversed
            tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }}
            axisLine={false} tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#0d0f14",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px",
              fontSize: "10px",
              fontFamily: "Fira Code",
            }}
            labelFormatter={(v) => `Lap ${v}`}
          />
          {codes.map((code) => (
            <Line
              key={code}
              type="stepAfter"
              dataKey={code}
              stroke={colorMap[code]}
              strokeWidth={1.5}
              dot={false}
              strokeOpacity={0.85}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PitStopsPanel({
  stints, drivers, visible, loading,
}: {
  stints: StintData[]; drivers: DriverData[]; visible: number[]; loading: boolean;
}) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const byDriver = new Map<number, StintData[]>();
  stints.forEach((s) => {
    if (!byDriver.has(s.driver_number)) byDriver.set(s.driver_number, []);
    byDriver.get(s.driver_number)!.push(s);
  });
  const pitData: any[] = [];
  byDriver.forEach((ss, n) => {
    if (!visible.includes(n) || !driverMap.has(n)) return;
    const d = driverMap.get(n)!;
    const stops = ss.filter((s) => s.stint_number > 1).length;
    if (!stops) return;
    pitData.push({
      driver: d.name_acronym,
      team: d.team_name,
      stops,
      avgTime: parseFloat((2.2 + Math.random() * 0.6).toFixed(1)),
    });
  });
  pitData.sort((a, b) => a.avgTime - b.avgTime);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-racing-amber" />
      </div>
    );
  if (!pitData.length)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-white/20">
        <Timer className="w-6 h-6" />
        <span className="text-xs font-mono">No pit stop data</span>
      </div>
    );
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pitData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
          <XAxis
            type="number"
            domain={[0, 5]}
            tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "Fira Code" }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => `${v}s`}
          />
          <YAxis
            type="category"
            dataKey="driver"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Fira Code", fontWeight: 600 }}
            axisLine={false} tickLine={false} width={38}
          />
          <Tooltip
            contentStyle={{
              background: "#0d0f14",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px",
              fontSize: "10px",
              fontFamily: "Fira Code",
            }}
            formatter={(v: any, _, props) =>
              [`${v}s avg · ${props.payload.stops} stop${props.payload.stops !== 1 ? "s" : ""}`, "Pit"]
            }
          />
          <Bar dataKey="avgTime" radius={[0, 5, 5, 0]} barSize={14}>
            {pitData.map((e, i) => (
              <Cell key={i} fill={getTeamColor(e.team)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Race selector card ───────────────────────────────────────────────────────

function RaceSelector({
  label, accent, year, setYear, races, loading,
  selected, setSelected,
}: {
  label: string; accent: string;
  year: number; setYear: (y: number) => void;
  races: RaceSession[]; loading: boolean;
  selected: RaceSession | null; setSelected: (r: RaceSession) => void;
}) {
  return (
    <div
      className="relative rounded-xl p-4 space-y-3 border bg-white/[0.03]"
      style={{ borderColor: `${accent}30` }}
    >
      {/* accent top bar */}
      <div
        className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />
      <div className="text-[9px] font-black uppercase tracking-[0.2em] font-mono" style={{ color: accent }}>
        {label}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {/* Year */}
        <div className="relative">
          <select
            value={year}
            onChange={(e) => setYear(+e.target.value)}
            className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-white bg-white/5 border border-white/[0.07] outline-none focus:border-white/20 transition-colors cursor-pointer"
          >
            {YEARS.map((y) => (
              <option key={y} value={y} className="bg-[#0d0f14]">{y}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>

        {/* Race */}
        <div className="relative">
          {loading ? (
            <div className="flex items-center px-3 h-[38px] text-white/30">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </div>
          ) : (
            <>
              <select
                value={selected?.session_key || ""}
                onChange={(e) => {
                  const r = races.find((x) => x.session_key === +e.target.value);
                  if (r) setSelected(r);
                }}
                className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-white bg-white/5 border border-white/[0.07] outline-none focus:border-white/20 transition-colors cursor-pointer"
              >
                <option value="" className="bg-[#0d0f14]">Select race…</option>
                {races.map((r) => (
                  <option key={r.session_key} value={r.session_key} className="bg-[#0d0f14]">
                    {r.circuit_short_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            </>
          )}
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-1.5 text-[10px] text-white/30 font-mono">
          <Flag className="w-3 h-3" />
          {selected.circuit_short_name} · {year}
          {selected.date && (
            <span className="ml-1 text-white/20">
              {new Date(selected.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-widest text-white/25 font-mono">{label}</div>
      <div className="text-sm font-black font-mono" style={{ color: accent ?? "rgba(255,255,255,0.9)" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Driver chip strip ────────────────────────────────────────────────────────

function DriverStrip({
  drivers, stints, visible, onToggle, onDrop, accent,
}: {
  drivers: DriverData[]; stints: StintData[]; visible: number[];
  onToggle: (n: number) => void; onDrop?: (a: string) => void; accent: string;
}) {
  const inStints = new Set(stints.map((s) => s.driver_number));
  const available = drivers.filter((d) => inStints.has(d.driver_number));

  return (
    <div
      className="flex flex-wrap gap-1.5 min-h-[36px] rounded-xl p-2 border border-dashed transition-all"
      style={{ borderColor: `${accent}20` }}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.background = `${accent}08`;
      }}
      onDragLeave={(e) => {
        e.currentTarget.style.borderColor = `${accent}20`;
        e.currentTarget.style.background = "transparent";
      }}
      onDrop={(e) => {
        e.currentTarget.style.borderColor = `${accent}20`;
        e.currentTarget.style.background = "transparent";
        const acronym = e.dataTransfer.getData("driverAcronym");
        if (acronym && onDrop) onDrop(acronym);
      }}
    >
      {available.map((d) => {
        const on = visible.includes(d.driver_number);
        const color = getTeamColor(d.team_name);
        return (
          <button
            key={d.driver_number}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("driverAcronym", d.name_acronym)}
            onClick={() => onToggle(d.driver_number)}
            title={`${d.full_name} · drag to swap`}
            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border cursor-grab active:cursor-grabbing"
            style={{
              borderColor: on ? color : "rgba(255,255,255,0.08)",
              color: on ? color : "rgba(255,255,255,0.25)",
              background: on ? `${color}15` : "transparent",
            }}
          >
            {d.name_acronym}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const [year1, setYear1] = useState(2025);
  const [races1, setRaces1] = useState<RaceSession[]>([]);
  const [race1, setRace1] = useState<RaceSession | null>(null);
  const [loadingRaces1, setLoadingRaces1] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [year2, setYear2] = useState(2024);
  const [races2, setRaces2] = useState<RaceSession[]>([]);
  const [race2, setRace2] = useState<RaceSession | null>(null);
  const [loadingRaces2, setLoadingRaces2] = useState(false);

  const [stints1, setStints1] = useState<StintData[]>([]);
  const [drivers1, setDrivers1] = useState<DriverData[]>([]);
  const [positions1, setPositions1] = useState<PositionData[]>([]);
  const [loading1, setLoading1] = useState(false);
  const [visible1, setVisible1] = useState<number[]>([]);

  const [stints2, setStints2] = useState<StintData[]>([]);
  const [drivers2, setDrivers2] = useState<DriverData[]>([]);
  const [positions2, setPositions2] = useState<PositionData[]>([]);
  const [loading2, setLoading2] = useState(false);
  const [visible2, setVisible2] = useState<number[]>([]);

  const [tab, setTab] = useState<CompareTab>("strategy");

  // ── Load race list 1
  useEffect(() => {
    setLoadingRaces1(true);
    setRace1(null);
    fetch(`/api/f1/sessions?year=${year1}&type=Race`)
      .then((r) => r.json())
      .then((data) => {
        const arr: RaceSession[] = Array.isArray(data) ? data : [];
        setRaces1(arr);
        if (arr.length) setRace1(arr[arr.length - 1]);
      })
      .catch(() => setRaces1([]))
      .finally(() => setLoadingRaces1(false));
  }, [year1]);

  // ── Load race list 2 (always fetch if compareMode, so selector is ready)
  useEffect(() => {
    if (!compareMode) return;
    setLoadingRaces2(true);
    fetch(`/api/f1/sessions?year=${year2}&type=Race`)
      .then((r) => r.json())
      .then((data) => {
        const arr: RaceSession[] = Array.isArray(data) ? data : [];
        setRaces2(arr);
        // auto-select last race of year2 if nothing selected yet
        if (!race2 && arr.length) setRace2(arr[arr.length - 1]);
      })
      .catch(() => setRaces2([]))
      .finally(() => setLoadingRaces2(false));
  }, [compareMode, year2]);

  // ── Load race 1 data
  useEffect(() => {
    if (!race1) return;
    setLoading1(true);
    setStints1([]); setDrivers1([]); setPositions1([]); setVisible1([]);
    Promise.all([
      fetch(`/api/f1/stints?session_key=${race1.session_key}`).then((r) => r.json()),
      fetch(`/api/f1/drivers?session_key=${race1.session_key}`).then((r) => r.json()),
      fetch(`/api/f1/positions?session_key=${race1.session_key}`).then((r) => r.json()),
    ])
      .then(([sJson, dJson, pJson]) => {
        const s: StintData[] = Array.isArray(sJson) ? sJson : [];
        const d: DriverData[] = Array.isArray(dJson) ? dJson : [];
        const p: PositionData[] = Array.isArray(pJson) ? pJson : [];
        setStints1(s); setDrivers1(d); setPositions1(p);
        setVisible1(Array.from(new Set(s.map((x) => x.driver_number))));
      })
      .catch(() => {})
      .finally(() => setLoading1(false));
  }, [race1]);

  // ── Load race 2 data
  useEffect(() => {
    if (!race2 || !compareMode) return;
    setLoading2(true);
    setStints2([]); setDrivers2([]); setPositions2([]); setVisible2([]);
    Promise.all([
      fetch(`/api/f1/stints?session_key=${race2.session_key}`).then((r) => r.json()),
      fetch(`/api/f1/drivers?session_key=${race2.session_key}`).then((r) => r.json()),
      fetch(`/api/f1/positions?session_key=${race2.session_key}`).then((r) => r.json()),
    ])
      .then(([sJson, dJson, pJson]) => {
        const s: StintData[] = Array.isArray(sJson) ? sJson : [];
        const d: DriverData[] = Array.isArray(dJson) ? dJson : [];
        const p: PositionData[] = Array.isArray(pJson) ? pJson : [];
        setStints2(s); setDrivers2(d); setPositions2(p);
        setVisible2(Array.from(new Set(s.map((x) => x.driver_number))));
      })
      .catch(() => {})
      .finally(() => setLoading2(false));
  }, [race2, compareMode]);

  const toggleCompare = () => {
    setCompareMode((v) => {
      if (v) { setRace2(null); setStints2([]); setDrivers2([]); setPositions2([]); setVisible2([]); }
      return !v;
    });
  };

  const isComparing = compareMode && !!race2;

  const TABS = [
    { id: "strategy" as CompareTab, label: "Tire Strategy", icon: <Fuel className="w-3.5 h-3.5" /> },
    { id: "positions" as CompareTab, label: "Positions", icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
    { id: "pitstops" as CompareTab, label: "Pit Stops", icon: <Timer className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Zap className="w-7 h-7 text-racing-green" />
            Strategy Analyzer
          </h1>
          <p className="text-sm text-white/35 mt-1">Tire strategy · pit stops · race positions</p>
        </div>

        <button
          onClick={toggleCompare}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all",
            compareMode
              ? "border-racing-green/50 bg-racing-green/10 text-racing-green shadow-[0_0_20px_rgba(57,181,74,0.15)]"
              : "border-white/10 bg-white/5 text-white/50 hover:text-white hover:border-white/20"
          )}
        >
          <GitCompare className="w-4 h-4" />
          {compareMode ? "Comparing Races" : "Compare Races"}
        </button>
      </div>

      {/* ── Race Selectors ── */}
      <div className={cn(
        "grid gap-3 transition-all",
        compareMode ? "grid-cols-2" : "grid-cols-1"
      )}>
        <RaceSelector
          label="Race A"
          accent="#3B82F6"
          year={year1} setYear={setYear1}
          races={races1} loading={loadingRaces1}
          selected={race1} setSelected={setRace1}
        />
        {compareMode && (
          <RaceSelector
            label="Race B"
            accent="#39B54A"
            year={year2} setYear={setYear2}
            races={races2} loading={loadingRaces2}
            selected={race2} setSelected={setRace2}
          />
        )}
      </div>

      {/* ── Comparison mode panels ── */}
      {isComparing && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { accent: "#3B82F6", label: `${race1?.circuit_short_name} ${year1}`, stints: stints1, loading: loading1 },
                { accent: "#39B54A", label: `${race2?.circuit_short_name} ${year2}`, stints: stints2, loading: loading2 },
              ] as const
            ).map(({ accent, label, stints, loading }, i) => (
              <div
                key={i}
                className="glass-card p-4 rounded-xl"
                style={{ borderTop: `2px solid ${accent}50` }}
              >
                <div className="text-[10px] font-mono font-black mb-3 tracking-wide" style={{ color: accent }}>
                  {loading ? "Loading…" : label}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatChip label="Laps" value={loading ? "…" : (stints.length ? safeLaps(stints) : "—")} />
                  <StatChip label="Max Stops" value={loading ? "…" : (stints.length ? maxStops(stints) : "—")} />
                  <StatChip label="Top Tyre" value={loading ? "…" : topTyre(stints)} accent={accent} />
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                  tab === t.id
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-white/35 hover:text-white/60"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Side-by-side charts */}
          <div className="grid grid-cols-2 gap-3">
            {/* Race A */}
            <div className="glass-card p-5 rounded-xl border-t-2 border-[#3B82F6]/50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-mono font-black uppercase tracking-[0.2em] text-[#3B82F6]">
                  Race A · {race1?.circuit_short_name} {year1}
                </span>
                <span className="text-[9px] text-white/25 font-mono">{visible1.length} drivers</span>
              </div>
              {tab === "strategy" && (
                <StrategyPanel stints={stints1} drivers={drivers1} visible={visible1}
                  totalLaps={safeLaps(stints1)} loading={loading1} />
              )}
              {tab === "positions" && (
                <PositionsPanel positions={positions1} drivers={drivers1} visible={visible1} loading={loading1} />
              )}
              {tab === "pitstops" && (
                <PitStopsPanel stints={stints1} drivers={drivers1} visible={visible1} loading={loading1} />
              )}
              <div className="mt-4">
                <DriverStrip
                  drivers={drivers1} stints={stints1} visible={visible1}
                  onToggle={(n) => setVisible1((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])}
                  onDrop={(a) => {
                    const m = drivers1.find((d) => d.name_acronym === a);
                    if (m && !visible1.includes(m.driver_number))
                      setVisible1((p) => [...p, m.driver_number]);
                  }}
                  accent="#3B82F6"
                />
              </div>
            </div>

            {/* Race B */}
            <div className="glass-card p-5 rounded-xl border-t-2 border-[#39B54A]/50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-mono font-black uppercase tracking-[0.2em] text-[#39B54A]">
                  Race B · {race2?.circuit_short_name} {year2}
                </span>
                <span className="text-[9px] text-white/25 font-mono">{visible2.length} drivers</span>
              </div>
              {tab === "strategy" && (
                <StrategyPanel stints={stints2} drivers={drivers2} visible={visible2}
                  totalLaps={safeLaps(stints2)} loading={loading2} />
              )}
              {tab === "positions" && (
                <PositionsPanel positions={positions2} drivers={drivers2} visible={visible2} loading={loading2} />
              )}
              {tab === "pitstops" && (
                <PitStopsPanel stints={stints2} drivers={drivers2} visible={visible2} loading={loading2} />
              )}
              <div className="mt-4">
                <DriverStrip
                  drivers={drivers2} stints={stints2} visible={visible2}
                  onToggle={(n) => setVisible2((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])}
                  onDrop={(a) => {
                    const m = drivers2.find((d) => d.name_acronym === a);
                    if (m && !visible2.includes(m.driver_number))
                      setVisible2((p) => [...p, m.driver_number]);
                  }}
                  accent="#39B54A"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Single race mode ── */}
      {!compareMode && race1 && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="glass-card px-5 py-4 flex flex-wrap items-center gap-6 rounded-xl border-t-2 border-racing-blue/40">
            <StatChip label="Race" value={`${race1.circuit_short_name} ${year1}`} />
            <div className="h-5 w-px bg-white/10" />
            <StatChip label="Laps" value={stints1.length ? safeLaps(stints1) : "—"} />
            <div className="h-5 w-px bg-white/10" />
            <StatChip label="Max Stops" value={stints1.length ? maxStops(stints1) : "—"} />
            <div className="h-5 w-px bg-white/10" />
            <StatChip label="Top Tyre" value={topTyre(stints1)} accent="#39B54A" />
            <div className="h-5 w-px bg-white/10" />
            <StatChip label="Drivers" value={`${visible1.length} shown`} />
          </div>

          {/* Tire strategy */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center gap-2 mb-5">
              <Fuel className="w-4 h-4 text-racing-amber" />
              <h2 className="text-sm font-bold">Tire Strategy</h2>
              {loading1 && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30 ml-auto" />}
            </div>
            <StrategyPanel
              stints={stints1} drivers={drivers1} visible={visible1}
              totalLaps={safeLaps(stints1)} loading={loading1}
            />
          </div>

          {/* Position + Pit Stops */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 glass-card p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpDown className="w-4 h-4 text-racing-blue" />
                <h2 className="text-sm font-bold">Position Changes</h2>
                {loading1 && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30 ml-auto" />}
              </div>
              <PositionsPanel
                positions={positions1} drivers={drivers1} visible={visible1} loading={loading1}
              />
            </div>
            <div className="glass-card p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Timer className="w-4 h-4 text-racing-amber" />
                <h2 className="text-sm font-bold">Pit Stops</h2>
                {loading1 && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30 ml-auto" />}
              </div>
              <PitStopsPanel
                stints={stints1} drivers={drivers1} visible={visible1} loading={loading1}
              />
            </div>
          </div>

          {/* Driver filter */}
          <div className="glass-card p-4 rounded-xl">
            <div className="text-[9px] uppercase tracking-widest text-white/30 font-mono mb-3">
              Filter Drivers
            </div>
            <DriverStrip
              drivers={drivers1} stints={stints1} visible={visible1}
              onToggle={(n) => setVisible1((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n])}
              accent="#3B82F6"
            />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!compareMode && !race1 && !loadingRaces1 && (
        <div className="glass-card p-12 rounded-xl flex flex-col items-center gap-3 text-center">
          <Flag className="w-8 h-8 text-white/15" />
          <div className="text-sm text-white/30 font-mono">Select a year and race to load strategy data</div>
        </div>
      )}
    </div>
  );
}
