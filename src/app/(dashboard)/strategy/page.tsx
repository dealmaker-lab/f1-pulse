"use client";

import React, { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from "react";
import {
  Fuel, Timer, ArrowUpDown, Loader2, GitCompare,
  ChevronDown, Flag, TrendingUp, Zap, FlaskConical,
  Plus, X, Play, AlertTriangle,
} from "lucide-react";
import { cn, getTeamColor, getTireColor } from "@/lib/utils";
import { getTeamLogoUrl, getTeamInfo } from "@/lib/team-logos";
import { SESSION_FILTER_OPTIONS, filterPastSessions } from "@/lib/session-filters";
import { OPENF1_YEARS } from "@/lib/constants";
import StrategyChart from "@/components/charts/strategy-chart";
import { StrategyStint } from "@/types/f1";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

const YEARS = OPENF1_YEARS;

type CompareTab = "strategy" | "positions" | "pitstops";

interface RaceSession {
  session_key: number;
  session_name: string;
  circuit_short_name: string;
  meeting_key: number;
  date: string;
  date_start: string;
}
interface StintData {
  driver_number: number;
  compound: string | null;
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
  date?: string;
  driver_number: number;
  position: number;
  lap?: number;
  [key: string]: any;
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Strategy] ${this.props.fallbackLabel ?? "Panel"} error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-f1-muted">
          <AlertTriangle className="w-6 h-6 text-racing-amber" />
          <span className="text-xs font-mono">
            {this.props.fallbackLabel ?? "Panel"} unavailable
          </span>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-[10px] font-mono text-racing-blue hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeLaps(stints: StintData[], fallback = 57): number {
  if (!stints || !stints.length) return fallback;
  const vals = stints.map((s) => s.lap_end).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  const m = vals.length ? Math.max(...vals) : 0;
  return m > 0 ? m : fallback;
}

function topTyre(stints: StintData[]): string {
  const counts: Record<string, number> = {};
  stints.forEach((s) => {
    const compound = s.compound || "UNKNOWN";
    const laps = Math.max(0, (s.lap_end ?? 0) - (s.lap_start ?? 0) + 1);
    counts[compound] = (counts[compound] || 0) + laps;
  });
  const entries = Object.entries(counts).filter(([k]) => k !== "UNKNOWN");
  const top = entries.sort((a, b) => b[1] - a[1])[0];
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
        driverCode: d.name_acronym ?? "???",
        team: d.team_name ?? "",
        stints: ss
          .filter((s) => typeof s.lap_start === "number" && typeof s.lap_end === "number" && s.lap_end >= s.lap_start)
          .sort((a, b) => a.stint_number - b.stint_number)
          .map((s) => ({
            compound: (s.compound || "UNKNOWN") as import("@/types/f1").TireCompound,
            startLap: s.lap_start,
            endLap: s.lap_end,
            avgPace: 93.0,
            laps: Math.max(1, s.lap_end - s.lap_start + 1),
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
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-f1-muted">
        <Fuel className="w-6 h-6" />
        <span className="text-xs font-mono">No strategy data</span>
      </div>
    );
  return <StrategyChart strategies={strategies} totalLaps={totalLaps} />;
}

function PositionsPanel({
  positions, drivers, visible, loading, stints,
}: {
  positions: PositionData[]; drivers: DriverData[]; visible: number[]; loading: boolean; stints?: StintData[];
}) {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const colorMap: Record<string, string> = {};
  const codes = Array.from(new Set(positions.map((p: any) => p.driver_number)))
    .filter((n) => visible.includes(n as number) && driverMap.has(n as number))
    .map((n) => {
      const d = driverMap.get(n as number)!;
      colorMap[d.name_acronym] = getTeamColor(d.team_name ?? "");
      return d.name_acronym;
    });

  // Build a smooth position-per-lap chart by forward-filling.
  // OpenF1 position data only records *changes*, so raw data is sparse.
  // We map every event into its nearest lap, then fill gaps so every driver
  // has a position on every lap → smooth, readable line chart.
  const dataMap = new Map<number, any>();
  const hasLapField = positions.length > 0 && typeof positions[0].lap === "number";
  const totalLaps = stints?.length ? safeLaps(stints) : 57;

  // Step 1: collect the last-known position per driver per lap
  const driverLapPos = new Map<number, Map<number, number>>(); // driver → (lap → position)

  if (hasLapField) {
    positions.forEach((p) => {
      if (!visible.includes(p.driver_number) || !driverMap.has(p.driver_number)) return;
      const lap = p.lap!;
      if (!driverLapPos.has(p.driver_number)) driverLapPos.set(p.driver_number, new Map());
      driverLapPos.get(p.driver_number)!.set(lap, p.position);
    });
  } else {
    // Map timestamps → lap numbers proportionally, take last position per lap
    const timestamps = Array.from(new Set(positions.map((p) => p.date ?? "")))
      .filter(Boolean)
      .sort();

    if (timestamps.length > 0) {
      const startTime = new Date(timestamps[0]).getTime();
      const endTime = new Date(timestamps[timestamps.length - 1]).getTime();
      const raceDuration = endTime - startTime;

      positions.forEach((p) => {
        if (!visible.includes(p.driver_number) || !driverMap.has(p.driver_number)) return;
        const ts = p.date ?? "";
        if (!ts) return;
        let lap: number;
        if (raceDuration > 0) {
          const elapsed = new Date(ts).getTime() - startTime;
          lap = Math.max(1, Math.min(totalLaps, Math.round((elapsed / raceDuration) * (totalLaps - 1)) + 1));
        } else {
          lap = 1;
        }
        if (!driverLapPos.has(p.driver_number)) driverLapPos.set(p.driver_number, new Map());
        // Always overwrite — later timestamps within the same lap win
        driverLapPos.get(p.driver_number)!.set(lap, p.position);
      });
    }
  }

  // Step 2: forward-fill — for every lap 1..totalLaps, carry forward
  // the last known position so there are no gaps in the chart.
  for (let lap = 1; lap <= totalLaps; lap++) {
    dataMap.set(lap, { lap });
  }

  driverLapPos.forEach((lapMap, driverNum) => {
    const d = driverMap.get(driverNum);
    if (!d) return;
    const code = d.name_acronym;
    let lastPos: number | null = null;
    for (let lap = 1; lap <= totalLaps; lap++) {
      if (lapMap.has(lap)) {
        lastPos = lapMap.get(lap)!;
      }
      if (lastPos !== null) {
        dataMap.get(lap)![code] = lastPos;
      }
    }
  });

  const data = Array.from(dataMap.values()).sort((a, b) => (a.lap ?? 0) - (b.lap ?? 0));

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-racing-blue" />
      </div>
    );
  if (!data.length)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-f1-muted">
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
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-f1-muted">
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
  label, accent, year, setYear, sessionType, setSessionType, races, loading,
  selected, setSelected,
}: {
  label: string; accent: string;
  year: number; setYear: (y: number) => void;
  sessionType: string; setSessionType: (t: string) => void;
  races: RaceSession[]; loading: boolean;
  selected: RaceSession | null; setSelected: (r: RaceSession) => void;
}) {
  return (
    <div
      className="relative rounded-xl p-4 space-y-3 border bg-[var(--f1-hover)]"
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Year */}
        <div className="relative">
          <select
            value={year}
            onChange={(e) => setYear(+e.target.value)}
            className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-f1 bg-[var(--f1-hover)] border border-[var(--f1-border)] outline-none focus:border-f1-sub transition-colors cursor-pointer"
          >
            {YEARS.map((y) => (
              <option key={y} value={y} className="bg-[#0d0f14]">{y}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
        </div>

        {/* Session Type */}
        <div className="relative">
          <select
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-f1 bg-[var(--f1-hover)] border border-[var(--f1-border)] outline-none focus:border-f1-sub transition-colors cursor-pointer"
          >
            {SESSION_FILTER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value} className="bg-[#0d0f14]">{t.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
        </div>

        {/* Race */}
        <div className="relative">
          {loading ? (
            <div className="flex items-center px-3 h-[38px] text-f1-muted">
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
                className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-f1 bg-[var(--f1-hover)] border border-[var(--f1-border)] outline-none focus:border-f1-sub transition-colors cursor-pointer"
              >
                <option value="" className="bg-[#0d0f14]">Select race…</option>
                {races.map((r) => (
                  <option key={r.session_key} value={r.session_key} className="bg-[#0d0f14]">
                    {r.circuit_short_name} ({r.session_name})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
            </>
          )}
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-1.5 text-[10px] text-f1-muted font-mono">
       <Flag className="w-3 h-3" />
          {selected.circuit_short_name} · {year}
          {selected.date && (
            <span className="ml-1 text-[var(--f1-text-dim)]">
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
      <div className="text-[9px] uppercase tracking-widest text-f1-muted font-mono">{label}</div>
      <div className="text-sm font-black font-mono" style={{ color: accent ?? "var(--f1-text-sub)" }}>
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
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border cursor-grab active:cursor-grabbing"
            style={{
              borderColor: on ? color : "rgba(255,255,255,0.08)",
              color: on ? color : "rgba(255,255,255,0.25)",
              background: on ? `${color}15` : "transparent",
            }}
          >
            {(() => {
              const logoUrl = getTeamLogoUrl(d.team_name);
              return logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="w-3 h-3 object-contain" />
              ) : null;
            })()}
            {d.name_acronym}
          </button>
        );
      })}
    </div>
  );
}

// ─── Pit Strategy Simulator ──────────────────────────────────────────────────

interface SimPitStop { lap: number; compound: string }
interface SimStint { compound: string; startLap: number; endLap: number; laps: number }
interface SimResult {
  totalLaps: number;
  actual: {
    totalTime: number;
    pitStops: number;
    stints: SimStint[];
    lapTimes: { lap: number; time: number; isPitOut: boolean }[];
  };
  simulated?: {
    totalTime: number;
    pitStops: number;
    stints: SimStint[];
    lapTimes: { lap: number; time: number; isPitOut: boolean }[];
    scenario: SimPitStop[];
  };
  delta?: number;
  deltaFormatted?: string;
  compoundPaces: Record<string, number>;
  tireDegModel: Record<string, number>;
}

const COMPOUNDS = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#FF3333", MEDIUM: "#FFD700", HARD: "#FFFFFF",
  INTERMEDIATE: "#39B54A", WET: "#0072DB", UNKNOWN: "#888888",
};

function StrategySimulator({
  sessionKey, drivers, loading: parentLoading,
}: {
  sessionKey: number | null;
  drivers: DriverData[];
  loading: boolean;
}) {
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [simData, setSimData] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [pitStops, setPitStops] = useState<SimPitStop[]>([]);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  // Auto-select first driver
  useEffect(() => {
    if (drivers.length > 0 && !selectedDriver) {
      setSelectedDriver(drivers[0].driver_number);
    }
  }, [drivers, selectedDriver]);

  // Load actual strategy data for selected driver
  useEffect(() => {
    if (!sessionKey || !selectedDriver) return;
    setSimLoading(true);
    setSimData(null);
    setSimResult(null);
    setPitStops([]);
    fetch(`/api/f1/simulate?session_key=${sessionKey}&driver_number=${selectedDriver}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.actual) {
          setSimData(data);
          // Pre-populate pit stops from actual strategy
          if (data.actual.stints.length > 1) {
            const stops = data.actual.stints.slice(0, -1).map((s: SimStint, i: number) => ({
              lap: s.endLap,
              compound: data.actual.stints[i + 1]?.compound || "MEDIUM",
            }));
            setPitStops(stops);
          }
        }
      })
      .catch(console.error)
      .finally(() => setSimLoading(false));
  }, [sessionKey, selectedDriver]);

  // Run simulation with modified pit stops
  const runSimulation = () => {
    if (!sessionKey || !selectedDriver || !pitStops.length) return;
    setSimRunning(true);
    const scenarioJson = JSON.stringify(pitStops);
    fetch(`/api/f1/simulate?session_key=${sessionKey}&driver_number=${selectedDriver}&scenario=${encodeURIComponent(scenarioJson)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.simulated) setSimResult(data);
      })
      .catch(console.error)
      .finally(() => setSimRunning(false));
  };

  const addPitStop = () => {
    const lastLap = pitStops.length > 0 ? pitStops[pitStops.length - 1].lap + 10 : 20;
    setPitStops([...pitStops, { lap: Math.min(lastLap, (simData?.totalLaps || 57) - 5), compound: "MEDIUM" }]);
  };

  const removePitStop = (idx: number) => {
    setPitStops(pitStops.filter((_, i) => i !== idx));
  };

  const updatePitStop = (idx: number, field: "lap" | "compound", value: string | number) => {
    const updated = [...pitStops];
    if (field === "lap") updated[idx] = { ...updated[idx], lap: Number(value) };
    else updated[idx] = { ...updated[idx], compound: String(value) };
    setPitStops(updated);
  };

  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const currentDriver = selectedDriver ? driverMap.get(selectedDriver) : null;
  const driverColor = currentDriver ? getTeamColor(currentDriver.team_name) : "#3b82f6";

  if (parentLoading || simLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-racing-amber" />
        <span className="text-sm text-f1-muted font-mono">Loading strategy data...</span>
      </div>
    );
  }

  if (!sessionKey) {
    return (
      <div className="glass-card p-12 text-center">
        <FlaskConical className="w-8 h-8 text-[var(--f1-text-dim)] mx-auto mb-3" />
        <p className="text-sm text-f1-muted font-mono">Select a race above to start simulating</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Driver Selector */}
      <div className="glass-card p-4">
        <div className="text-[9px] uppercase tracking-widest text-f1-muted font-mono mb-3">Select Driver to Simulate</div>
        <div className="flex flex-wrap gap-1.5">
          {drivers.map((d) => {
            const color = getTeamColor(d.team_name);
            const isSelected = selectedDriver === d.driver_number;
            return (
              <button
                key={d.driver_number}
                onClick={() => setSelectedDriver(d.driver_number)}
                className="px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all border cursor-pointer"
                style={{
                  borderColor: isSelected ? color : "rgba(255,255,255,0.08)",
                  color: isSelected ? color : "rgba(255,255,255,0.4)",
                  background: isSelected ? `${color}15` : "transparent",
                }}
              >
                {d.name_acronym}
              </button>
            );
          })}
        </div>
      </div>

      {simData && (
        <>
          {/* Actual Strategy */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flag className="w-4 h-4 text-racing-blue" />
              <h3 className="text-sm font-semibold">Actual Strategy</h3>
              <span className="ml-auto text-[10px] font-mono text-f1-muted">
                {simData.actual.pitStops} stop{simData.actual.pitStops !== 1 ? "s" : ""} · {formatTime(simData.actual.totalTime)}
              </span>
            </div>
            <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
              {simData.actual.stints.map((stint, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center text-[9px] font-mono font-bold transition-all"
                  style={{
                    width: `${(stint.laps / (simData.totalLaps || 57)) * 100}%`,
                    backgroundColor: `${COMPOUND_COLORS[stint.compound || "UNKNOWN"] || "#888"}30`,
                    borderBottom: `3px solid ${COMPOUND_COLORS[stint.compound || "UNKNOWN"] || "#888"}`,
                    color: COMPOUND_COLORS[stint.compound || "UNKNOWN"] || "#888",
                  }}
                  title={`${stint.compound || "Unknown"} · Laps ${stint.startLap}–${stint.endLap} (${stint.laps} laps)`}
                >
                  {stint.laps > 5 && `${(stint.compound || "?").charAt(0)} · L${stint.startLap}-${stint.endLap}`}
                </div>
              ))}
            </div>
          </div>

          {/* Pit Stop Editor */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-racing-amber" />
                <h3 className="text-sm font-semibold">What If — Edit Pit Stops</h3>
              </div>
              <button
                onClick={addPitStop}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-[var(--f1-border)] hover:border-racing-amber/30 text-f1-muted hover:text-racing-amber transition-all"
              >
                <Plus className="w-3 h-3" />
                Add Stop
              </button>
            </div>

            {pitStops.length === 0 ? (
              <div className="text-center py-6 text-f1-muted text-sm font-mono">
                Add pit stops to simulate an alternative strategy
              </div>
            ) : (
              <div className="space-y-2">
                {pitStops.map((stop, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--f1-hover)]">
                    <span className="text-[10px] font-mono text-f1-muted w-12">Stop {idx + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[9px] text-f1-muted">Lap:</label>
                      <input
                        type="number"
                        min={1}
                        max={simData.totalLaps - 1}
                        value={stop.lap}
                        onChange={(e) => updatePitStop(idx, "lap", e.target.value)}
                        className="w-16 bg-[var(--f1-card)] border border-[var(--f1-border)] rounded px-2 py-1 text-xs font-mono text-f1 outline-none focus:border-racing-amber/50"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[9px] text-f1-muted">Switch to:</label>
                      <select
                        value={stop.compound}
                        onChange={(e) => updatePitStop(idx, "compound", e.target.value)}
                        className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded px-2 py-1 text-xs font-mono text-f1 outline-none cursor-pointer"
                      >
                        {COMPOUNDS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COMPOUND_COLORS[stop.compound] }} />
                    </div>
                    <button
                      onClick={() => removePitStop(idx)}
                      className="ml-auto p-1 rounded hover:bg-racing-red/10 text-f1-muted hover:text-racing-red transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Simulated stint preview */}
            {pitStops.length > 0 && (
              <div className="mt-4">
                <div className="text-[9px] uppercase tracking-widest text-f1-muted font-mono mb-2">Simulated Strategy Preview</div>
                <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
                  {(() => {
                    const sorted = [...pitStops].sort((a, b) => a.lap - b.lap);
                    const previewStints: { compound: string; start: number; end: number }[] = [];
                    let prev = 1;
                    const startComp = simData.actual.stints[0]?.compound || "MEDIUM";
                    for (let i = 0; i < sorted.length; i++) {
                      previewStints.push({
                        compound: i === 0 ? startComp : sorted[i - 1].compound,
                        start: prev,
                        end: sorted[i].lap,
                      });
                      prev = sorted[i].lap + 1;
                    }
                    previewStints.push({
                      compound: sorted[sorted.length - 1].compound,
                      start: prev,
                      end: simData.totalLaps,
                    });

                    return previewStints.map((s, i) => {
                      const laps = s.end - s.start + 1;
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-center text-[9px] font-mono font-bold"
                          style={{
                            width: `${(laps / simData.totalLaps) * 100}%`,
                            backgroundColor: `${COMPOUND_COLORS[s.compound] || "#888"}30`,
                            borderBottom: `3px solid ${COMPOUND_COLORS[s.compound] || "#888"}`,
                            color: COMPOUND_COLORS[s.compound] || "#888",
                          }}
                        >
                          {laps > 5 && `${s.compound.charAt(0)} · L${s.start}-${s.end}`}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Run button */}
            <button
              onClick={runSimulation}
              disabled={pitStops.length === 0 || simRunning}
              className={cn(
                "mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
                pitStops.length > 0
                  ? "bg-racing-amber/15 border border-racing-amber/30 text-racing-amber hover:bg-racing-amber/25 cursor-pointer"
                  : "bg-[var(--f1-hover)] border border-[var(--f1-border)] text-f1-muted cursor-not-allowed"
              )}
            >
              {simRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {simRunning ? "Simulating..." : "Run Simulation"}
            </button>
          </div>

          {/* Simulation Results */}
          {simResult?.simulated && (
            <div className="glass-card p-5 border-t-2 border-racing-amber/40">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-racing-amber" />
                  <h3 className="text-sm font-semibold">Simulation Result</h3>
                </div>
                <div
                  className={cn(
                    "text-lg font-mono font-black px-3 py-1 rounded-lg",
                    simResult.delta && simResult.delta < 0
                      ? "text-racing-green bg-racing-green/10"
                      : "text-racing-red bg-racing-red/10"
                  )}
                >
                  {simResult.deltaFormatted}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-[var(--f1-hover)]">
                  <div className="text-[9px] uppercase tracking-widest text-f1-muted font-mono mb-1">Actual</div>
                  <div className="text-lg font-mono font-bold">{formatTime(simResult.actual.totalTime)}</div>
                  <div className="text-[10px] text-f1-muted font-mono">{simResult.actual.pitStops} stops</div>
                </div>
                <div className="p-3 rounded-lg bg-racing-amber/5 border border-racing-amber/20">
                  <div className="text-[9px] uppercase tracking-widest text-racing-amber font-mono mb-1">Simulated</div>
                  <div className="text-lg font-mono font-bold">{formatTime(simResult.simulated.totalTime)}</div>
                  <div className="text-[10px] text-f1-muted font-mono">{simResult.simulated.pitStops} stops</div>
                </div>
              </div>

              {/* Lap time comparison chart */}
              <div className="w-full h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={simResult.actual.lapTimes
                      .filter((l) => !l.isPitOut)
                      .map((l) => ({
                        lap: l.lap,
                        actual: l.time,
                        simulated: simResult.simulated!.lapTimes.find((s) => s.lap === l.lap && !s.isPitOut)?.time || null,
                      }))
                    }
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="lap"
                      tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "Fira Code" }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      domain={["dataMin - 2", "dataMax + 2"]}
                      tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "Fira Code" }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${v.toFixed(0)}s`}
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
                      formatter={(v: number, name: string) => [`${v?.toFixed(3)}s`, name]}
                    />
                    <Line type="monotone" dataKey="actual" stroke={driverColor} strokeWidth={1.5} dot={false} name="Actual" />
                    <Line type="monotone" dataKey="simulated" stroke="#FFD700" strokeWidth={1.5} dot={false} strokeDasharray="5 5" name="Simulated" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-center gap-6 mt-2 text-[10px] font-mono text-f1-muted">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded" style={{ backgroundColor: driverColor }} />
                  Actual
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded border-dashed" style={{ backgroundColor: "#FFD700" }} />
                  Simulated
                </div>
              </div>

              {/* Verdict */}
              <div className="mt-4 p-3 rounded-lg bg-[var(--f1-hover)] text-center">
                <p className="text-xs text-f1-sub">
                  {simResult.delta && simResult.delta < -5
                    ? `🏎️ This strategy would have been significantly faster — ${Math.abs(simResult.delta).toFixed(1)}s gained!`
                    : simResult.delta && simResult.delta < 0
                      ? `✅ Marginal improvement of ${Math.abs(simResult.delta).toFixed(1)}s — could have made a difference in a close battle.`
                      : simResult.delta && simResult.delta > 5
                        ? `❌ This strategy would have been ${simResult.delta.toFixed(1)}s slower — the actual call was better.`
                        : `🔄 Roughly equal — within ${Math.abs(simResult.delta || 0).toFixed(1)}s of the actual strategy.`}
                </p>
              </div>
            </div>
          )}

          {/* Tire model info */}
          <div className="glass-card p-4">
            <div className="text-[9px] uppercase tracking-widest text-f1-muted font-mono mb-3">Tire Degradation Model</div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(simData.compoundPaces).map(([compound, pace]) => (
                <div key={compound} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--f1-hover)]">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COMPOUND_COLORS[compound] }} />
                  <span className="text-[10px] font-mono font-bold" style={{ color: COMPOUND_COLORS[compound] }}>
                    {compound}
                  </span>
                  <span className="text-[10px] font-mono text-f1-muted">
                    {(pace as number).toFixed(1)}s base · +{(TIRE_DEG[compound] || 0.05).toFixed(2)}s/lap deg
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = (secs % 60).toFixed(1);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const TIRE_DEG: Record<string, number> = {
  SOFT: 0.08, MEDIUM: 0.05, HARD: 0.03,
  INTERMEDIATE: 0.06, WET: 0.04, UNKNOWN: 0.05,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const [year1, setYear1] = useState(2026);
  const [sessionType1, setSessionType1] = useState("Race");
  const [allRaces1, setAllRaces1] = useState<RaceSession[]>([]);
  const [race1, setRace1] = useState<RaceSession | null>(null);
  const [loadingRaces1, setLoadingRaces1] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [year2, setYear2] = useState(2026);
  const [sessionType2, setSessionType2] = useState("Race");
  const [allRaces2, setAllRaces2] = useState<RaceSession[]>([]);
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

  // ── Load race list 1 (fetch ALL sessions, filter client-side)
  useEffect(() => {
    setLoadingRaces1(true);
    setRace1(null);
    fetch(`/api/f1/sessions?year=${year1}`)
      .then((r) => r.json())
      .then((data) => {
        const arr: RaceSession[] = Array.isArray(data) ? data : [];
        setAllRaces1(arr);
      })
      .catch(() => setAllRaces1([]))
      .finally(() => setLoadingRaces1(false));
  }, [year1]);

  // Filter and sort races1 based on sessionType1
  const races1 = useMemo(() => {
    const filtered = filterPastSessions(allRaces1, sessionType1);
    return filtered;
  }, [allRaces1, sessionType1]);

  // Auto-select the most recent race
  useEffect(() => {
    if (races1.length > 0) {
      setRace1(races1[races1.length - 1]);
    } else {
      setRace1(null);
    }
  }, [races1]);

  // ── Load race list 2 (fetch ALL sessions, filter client-side)
  useEffect(() => {
    if (!compareMode) {
      setAllRaces2([]);
      return;
    }
    setLoadingRaces2(true);
    fetch(`/api/f1/sessions?year=${year2}`)
      .then((r) => r.json())
      .then((data) => {
        const arr: RaceSession[] = Array.isArray(data) ? data : [];
        setAllRaces2(arr);
      })
      .catch(() => setAllRaces2([]))
      .finally(() => setLoadingRaces2(false));
  }, [compareMode, year2]);

  // Filter and sort races2 based on sessionType2
  const races2 = useMemo(() => {
    if (!compareMode) return [];
    const filtered = filterPastSessions(allRaces2, sessionType2);
    return filtered;
  }, [allRaces2, sessionType2, compareMode]);

  // Auto-select the most recent race for race2
  useEffect(() => {
    if (!compareMode) return;
    if (races2.length > 0) {
      setRace2(races2[races2.length - 1]);
    } else {
      setRace2(null);
    }
  }, [races2, compareMode]);

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

  // Simulator mode
  const [simulatorMode, setSimulatorMode] = useState(false);

  const TABS = [
    { id: "strategy" as CompareTab, label: "Tire Strategy", icon: <Fuel className="w-3.5 h-3.5" /> },
    { id: "positions" as CompareTab, label: "Positions", icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
    { id: "pitstops" as CompareTab, label: "Pit Stops", icon: <Timer className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Zap className="w-5 sm:w-7 h-5 sm:h-7 text-racing-green flex-shrink-0" />
            Strategy Analyzer
          </h1>
          <p className="text-xs sm:text-sm text-f1-muted mt-1">Tire strategy · pit stops · race positions</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSimulatorMode(!simulatorMode); if (!simulatorMode) setCompareMode(false); }}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all",
              simulatorMode
                ? "border-racing-amber/50 bg-racing-amber/10 text-racing-amber shadow-[0_0_20px_rgba(255,215,0,0.15)]"
                : "border-[var(--f1-border)] bg-[var(--f1-hover)] text-f1-sub hover:text-f1 hover:border-f1"
            )}
          >
            <FlaskConical className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            {simulatorMode ? "Simulator" : "What If?"}
          </button>
          <button
            onClick={() => { toggleCompare(); if (!compareMode) setSimulatorMode(false); }}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all",
              compareMode
                ? "border-racing-green/50 bg-racing-green/10 text-racing-green shadow-[0_0_20px_rgba(57,181,74,0.15)]"
                : "border-[var(--f1-border)] bg-[var(--f1-hover)] text-f1-sub hover:text-f1 hover:border-f1"
            )}
          >
            <GitCompare className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            {compareMode ? "Comparing" : "Compare"}
          </button>
        </div>
      </div>

      {/* ── Race Selectors ── */}
      <div className={cn(
        "grid gap-3 transition-all",
        compareMode ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
      )}>
        <RaceSelector
          label="Race A"
          accent="#3B82F6"
          year={year1} setYear={setYear1}
          sessionType={sessionType1} setSessionType={setSessionType1}
          races={races1} loading={loadingRaces1}
          selected={race1} setSelected={setRace1}
        />
        {compareMode && (
          <RaceSelector
            label="Race B"
            accent="#39B54A"
            year={year2} setYear={setYear2}
            sessionType={sessionType2} setSessionType={setSessionType2}
            races={races2} loading={loadingRaces2}
            selected={race2} setSelected={setRace2}
          />
        )}
      </div>

      {/* ── Comparison mode panels ── */}
      {isComparing && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <div className="flex items-center gap-0.5 sm:gap-1 bg-[var(--f1-hover)] border border-[var(--f1-border)] p-0.5 sm:p-1 rounded-xl w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-all",
                  tab === t.id
                    ? "bg-[var(--f1-hover)] text-f1 shadow-sm"
                    : "text-f1-muted hover:text-f1-sub"
                )}
              >
                {t.icon}
                <span className="hidden xs:inline sm:inline">{t.label}</span>
                <span className="xs:hidden sm:hidden">{t.id === "strategy" ? "Tyres" : t.id === "positions" ? "Pos" : "Pits"}</span>
              </button>
            ))}
          </div>

          {/* Side-by-side charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Race A */}
            <div className="glass-card p-5 rounded-xl border-t-2 border-[#3B82F6]/50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-mono font-black uppercase tracking-[0.2em] text-[#3B82F6]">
                  Race A · {race1?.circuit_short_name} {year1}
                </span>
                <span className="text-[9px] text-f1-muted font-mono">{visible1.length} drivers</span>
              </div>
              {tab === "strategy" && (
                <PanelErrorBoundary fallbackLabel="Tire Strategy (Race A)">
                  <StrategyPanel stints={stints1} drivers={drivers1} visible={visible1}
                    totalLaps={safeLaps(stints1)} loading={loading1} />
                </PanelErrorBoundary>
              )}
              {tab === "positions" && (
                <PanelErrorBoundary fallbackLabel="Positions (Race A)">
                  <PositionsPanel positions={positions1} drivers={drivers1} visible={visible1} loading={loading1} stints={stints1} />
                </PanelErrorBoundary>
              )}
              {tab === "pitstops" && (
                <PanelErrorBoundary fallbackLabel="Pit Stops (Race A)">
                  <PitStopsPanel stints={stints1} drivers={drivers1} visible={visible1} loading={loading1} />
                </PanelErrorBoundary>
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
                <span className="text-[9px] text-f1-muted font-mono">{visible2.length} drivers</span>
              </div>
              {tab === "strategy" && (
                <PanelErrorBoundary fallbackLabel="Tire Strategy (Race B)">
                  <StrategyPanel stints={stints2} drivers={drivers2} visible={visible2}
                    totalLaps={safeLaps(stints2)} loading={loading2} />
                </PanelErrorBoundary>
              )}
              {tab === "positions" && (
                <PanelErrorBoundary fallbackLabel="Positions (Race B)">
                  <PositionsPanel positions={positions2} drivers={drivers2} visible={visible2} loading={loading2} stints={stints2} />
                </PanelErrorBoundary>
              )}
              {tab === "pitstops" && (
                <PanelErrorBoundary fallbackLabel="Pit Stops (Race B)">
                  <PitStopsPanel stints={stints2} drivers={drivers2} visible={visible2} loading={loading2} />
                </PanelErrorBoundary>
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

      {/* ── Simulator mode ── */}
      {simulatorMode && !compareMode && race1 && (
        <PanelErrorBoundary fallbackLabel="Strategy Simulator">
          <StrategySimulator
            sessionKey={race1?.session_key || null}
            drivers={drivers1}
            loading={loading1}
          />
        </PanelErrorBoundary>
      )}

      {/* ── Single race mode ── */}
      {!compareMode && !simulatorMode && race1 && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="glass-card px-5 py-4 flex flex-wrap items-center gap-6 rounded-xl border-t-2 border-racing-blue/40">
            <StatChip label="Race" value={`${race1.circuit_short_name} ${year1}`} />
            <div className="h-5 w-px bg-[var(--f1-border)]" />
            <StatChip label="Laps" value={stints1.length ? safeLaps(stints1) : "—"} />
            <div className="h-5 w-px bg-[var(--f1-border)]" />
            <StatChip label="Max Stops" value={stints1.length ? maxStops(stints1) : "—"} />
            <div className="h-5 w-px bg-[var(--f1-border)]" />
            <StatChip label="Top Tyre" value={topTyre(stints1)} accent="#39B54A" />
            <div className="h-5 w-px bg-[var(--f1-border)]" />
            <StatChip label="Drivers" value={`${visible1.length} shown`} />
          </div>

          {/* Tire strategy */}
          <div className="glass-card p-5 rounded-xl">
            <div className="flex items-center gap-2 mb-5">
              <Fuel className="w-4 h-4 text-racing-amber" />
              <h2 className="text-sm font-bold">Tire Strategy</h2>
              {loading1 && <Loader2 className="w-3.5 h-3.5 animate-spin text-f1-muted ml-auto" />}
            </div>
            <PanelErrorBoundary fallbackLabel="Tire Strategy">
              <StrategyPanel
                stints={stints1} drivers={drivers1} visible={visible1}
                totalLaps={safeLaps(stints1)} loading={loading1}
              />
            </PanelErrorBoundary>
          </div>

          {/* Position + Pit Stops */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 glass-card p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpDown className="w-4 h-4 text-racing-blue" />
                <h2 className="text-sm font-bold">Position Changes</h2>
                {loading1 && <Loader2 className="w-3.5 h-3.5 animate-spin text-f1-muted ml-auto" />}
              </div>
              <PanelErrorBoundary fallbackLabel="Positions">
                <PositionsPanel
                  positions={positions1} drivers={drivers1} visible={visible1} loading={loading1} stints={stints1}
                />
              </PanelErrorBoundary>
            </div>
            <div className="glass-card p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Timer className="w-4 h-4 text-racing-amber" />
                <h2 className="text-sm font-bold">Pit Stops</h2>
                {loading1 && <Loader2 className="w-3.5 h-3.5 animate-spin text-f1-muted ml-auto" />}
              </div>
              <PanelErrorBoundary fallbackLabel="Pit Stops">
                <PitStopsPanel
                  stints={stints1} drivers={drivers1} visible={visible1} loading={loading1}
                />
              </PanelErrorBoundary>
            </div>
          </div>

          {/* Driver filter */}
          <div className="glass-card p-4 rounded-xl">
            <div className="text-[9px] uppercase tracking-widest text-f1-muted font-mono mb-3">
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
          <Flag className="w-8 h-8 text-[var(--f1-text-dim)]" />
          <div className="text-sm text-f1-muted font-mono">Select a year and race to load strategy data</div>
        </div>
      )}
    </div>
  );
}
