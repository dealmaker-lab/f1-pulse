"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Activity, Gauge, Zap, CircleDot, Loader2, ChevronDown,
  AlertTriangle, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";

// ===== Types =====
interface SessionInfo {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  circuit_short_name: string;
  country_name: string;
  year: number;
}

interface DriverInfo {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

interface LapInfo {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
}

interface CarDataPoint {
  date: string;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  drs: number;
  rpm: number;
  driver_number: number;
}

interface TelemetryPoint {
  idx: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  drs: number;
  rpm: number;
}

// ===== Helpers =====
function formatLapTime(secs: number | null): string {
  if (!secs) return "--.---";
  const mins = Math.floor(secs / 60);
  const remainder = (secs % 60).toFixed(3);
  return mins > 0
    ? `${mins}:${parseFloat(remainder) < 10 ? "0" : ""}${remainder}`
    : `${remainder}s`;
}

function sliceTelemetryForLap(
  allData: CarDataPoint[],
  lapStartMs: number,
  lapEndMs: number
): TelemetryPoint[] {
  const filtered = allData.filter((d) => {
    const t = new Date(d.date).getTime();
    return t >= lapStartMs && t <= lapEndMs;
  });

  // Downsample to ~500 points for performance
  const step = Math.max(1, Math.floor(filtered.length / 500));
  return filtered
    .filter((_, i) => i % step === 0)
    .map((d, i) => ({
      idx: i,
      speed: d.speed,
      throttle: d.throttle,
      brake: d.brake ? 100 : 0,
      gear: d.n_gear,
      drs: d.drs,
      rpm: d.rpm,
    }));
}

// ===== Component =====
export default function TelemetryPage() {
  // Session selection
  const [year, setYear] = useState(2024);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [sessionType, setSessionType] = useState<"Race" | "Qualifying">("Qualifying");

  // Driver/Lap selection
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [driver1, setDriver1] = useState<DriverInfo | null>(null);
  const [driver2, setDriver2] = useState<DriverInfo | null>(null);
  const [laps1, setLaps1] = useState<LapInfo[]>([]);
  const [laps2, setLaps2] = useState<LapInfo[]>([]);
  const [selectedLap1, setSelectedLap1] = useState<number | null>(null);
  const [selectedLap2, setSelectedLap2] = useState<number | null>(null);

  // Telemetry data
  const [rawData1, setRawData1] = useState<CarDataPoint[]>([]);
  const [rawData2, setRawData2] = useState<CarDataPoint[]>([]);
  const [metric, setMetric] = useState<"speed" | "throttle" | "brake" | "gear">("speed");

  // Loading states
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ===== Fetch sessions =====
  useEffect(() => {
    setLoadingSessions(true);
    setError(null);
    fetch(`/api/f1/sessions?year=${year}&type=${sessionType}`)
      .then((r) => r.json())
      .then((data: SessionInfo[]) => {
        const sorted = Array.isArray(data)
          ? data.sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())
          : [];
        setSessions(sorted);
        if (sorted.length) setSelectedSession(sorted[0]);
      })
      .catch(() => setError("Failed to load sessions"))
      .finally(() => setLoadingSessions(false));
  }, [year, sessionType]);

  // ===== Fetch drivers for selected session =====
  useEffect(() => {
    if (!selectedSession) return;
    setLoadingDrivers(true);
    setDrivers([]);
    setDriver1(null);
    setDriver2(null);
    setRawData1([]);
    setRawData2([]);

    fetch(`/api/f1/drivers?session_key=${selectedSession.session_key}`)
      .then((r) => r.json())
      .then((data: DriverInfo[]) => {
        if (!Array.isArray(data)) return;
        const unique = Array.from(
          new Map(data.map((d) => [d.driver_number, d])).values()
        ).sort((a, b) => a.driver_number - b.driver_number);
        setDrivers(unique);
        if (unique.length >= 2) {
          setDriver1(unique[0]);
          setDriver2(unique[1]);
        }
      })
      .catch(() => setError("Failed to load drivers"))
      .finally(() => setLoadingDrivers(false));
  }, [selectedSession]);

  // ===== Fetch laps for each driver =====
  useEffect(() => {
    if (!selectedSession || !driver1) return;
    fetch(`/api/f1/laps?session_key=${selectedSession.session_key}&driver_number=${driver1.driver_number}`)
      .then((r) => r.json())
      .then((data: LapInfo[]) => {
        if (!Array.isArray(data)) return;
        const valid = data.filter((l) => l.lap_duration && !l.is_pit_out_lap);
        setLaps1(valid);
        if (valid.length) {
          const fastest = valid.reduce((a, b) =>
            (a.lap_duration || 999) < (b.lap_duration || 999) ? a : b
          );
          setSelectedLap1(fastest.lap_number);
        }
      })
      .catch(() => {});
  }, [selectedSession, driver1]);

  useEffect(() => {
    if (!selectedSession || !driver2) return;
    fetch(`/api/f1/laps?session_key=${selectedSession.session_key}&driver_number=${driver2.driver_number}`)
      .then((r) => r.json())
      .then((data: LapInfo[]) => {
        if (!Array.isArray(data)) return;
        const valid = data.filter((l) => l.lap_duration && !l.is_pit_out_lap);
        setLaps2(valid);
        if (valid.length) {
          const fastest = valid.reduce((a, b) =>
            (a.lap_duration || 999) < (b.lap_duration || 999) ? a : b
          );
          setSelectedLap2(fastest.lap_number);
        }
      })
      .catch(() => {});
  }, [selectedSession, driver2]);

  // ===== Fetch car data for both drivers =====
  useEffect(() => {
    if (!selectedSession || !driver1 || !driver2) return;
    setLoadingTelemetry(true);
    setError(null);

    Promise.all([
      fetch(`/api/f1/car-data?session_key=${selectedSession.session_key}&driver_number=${driver1.driver_number}`).then((r) => r.json()),
      fetch(`/api/f1/car-data?session_key=${selectedSession.session_key}&driver_number=${driver2.driver_number}`).then((r) => r.json()),
    ])
      .then(([d1, d2]) => {
        setRawData1(Array.isArray(d1) ? d1 : []);
        setRawData2(Array.isArray(d2) ? d2 : []);
      })
      .catch(() => setError("Failed to load telemetry data"))
      .finally(() => setLoadingTelemetry(false));
  }, [selectedSession, driver1, driver2]);

  // ===== Process telemetry for selected laps =====
  const processedData = useMemo(() => {
    if (!rawData1.length || !rawData2.length || !selectedLap1 || !selectedLap2) return null;

    const lap1Info = laps1.find((l) => l.lap_number === selectedLap1);
    const lap2Info = laps2.find((l) => l.lap_number === selectedLap2);
    if (!lap1Info || !lap2Info) return null;

    // Calculate lap boundaries using cumulative lap durations
    const allDates1 = rawData1.map((d) => new Date(d.date).getTime()).sort((a, b) => a - b);
    const allDates2 = rawData2.map((d) => new Date(d.date).getTime()).sort((a, b) => a - b);
    if (!allDates1.length || !allDates2.length) return null;

    let cumTime1 = 0;
    for (const l of laps1) {
      if (l.lap_number < selectedLap1 && l.lap_duration) cumTime1 += l.lap_duration * 1000;
    }
    const lapDur1Ms = (lap1Info.lap_duration || 90) * 1000;
    const start1 = allDates1[0] + cumTime1;
    const end1 = start1 + lapDur1Ms;

    let cumTime2 = 0;
    for (const l of laps2) {
      if (l.lap_number < selectedLap2 && l.lap_duration) cumTime2 += l.lap_duration * 1000;
    }
    const lapDur2Ms = (lap2Info.lap_duration || 90) * 1000;
    const start2 = allDates2[0] + cumTime2;
    const end2 = start2 + lapDur2Ms;

    const telem1 = sliceTelemetryForLap(rawData1, start1, end1);
    const telem2 = sliceTelemetryForLap(rawData2, start2, end2);

    if (!telem1.length || !telem2.length) return null;

    const len = Math.min(telem1.length, telem2.length);
    const merged = [];

    for (let i = 0; i < len; i++) {
      merged.push({
        pct: Math.round((i / len) * 100),
        d1_speed: telem1[i].speed,
        d2_speed: telem2[i].speed,
        d1_throttle: telem1[i].throttle,
        d2_throttle: telem2[i].throttle,
        d1_brake: telem1[i].brake,
        d2_brake: telem2[i].brake,
        d1_gear: telem1[i].gear,
        d2_gear: telem2[i].gear,
        d1_rpm: telem1[i].rpm,
        d2_rpm: telem2[i].rpm,
      });
    }

    return { merged, telem1, telem2, lap1Info, lap2Info };
  }, [rawData1, rawData2, selectedLap1, selectedLap2, laps1, laps2]);

  // Colors
  const d1Color = driver1 ? `#${driver1.team_colour || "3b82f6"}` : "#3b82f6";
  const d2Color = driver2 ? `#${driver2.team_colour || "ef4444"}` : "#ef4444";

  // Stats
  const stats = useMemo(() => {
    if (!processedData) return null;
    const { telem1, telem2, lap1Info, lap2Info } = processedData;
    return {
      d1: {
        maxSpeed: Math.max(...telem1.map((t) => t.speed)),
        avgSpeed: Math.round(telem1.reduce((a, b) => a + b.speed, 0) / telem1.length),
        maxRPM: Math.max(...telem1.map((t) => t.rpm)),
        lapTime: lap1Info.lap_duration,
      },
      d2: {
        maxSpeed: Math.max(...telem2.map((t) => t.speed)),
        avgSpeed: Math.round(telem2.reduce((a, b) => a + b.speed, 0) / telem2.length),
        maxRPM: Math.max(...telem2.map((t) => t.rpm)),
        lapTime: lap2Info.lap_duration,
      },
    };
  }, [processedData]);

  const metricConfig = {
    speed: { label: "Speed (km/h)", d1Key: "d1_speed", d2Key: "d2_speed", domain: [0, 370] },
    throttle: { label: "Throttle (%)", d1Key: "d1_throttle", d2Key: "d2_throttle", domain: [0, 100] },
    brake: { label: "Brake", d1Key: "d1_brake", d2Key: "d2_brake", domain: [0, 100] },
    gear: { label: "Gear", d1Key: "d1_gear", d2Key: "d2_gear", domain: [0, 9] },
  };
  const cfg = metricConfig[metric];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Activity className="w-7 h-7 text-racing-blue" />
          Telemetry Deep Dive
        </h1>
        <p className="text-sm text-f1-muted mt-1">
          Real telemetry data — compare any two drivers, any lap
        </p>
      </div>

      {/* Session Selector */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold block mb-1.5">Year</label>
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setSelectedSession(null); }}
              className="bg-[var(--f1-hover)] border border-[var(--f1-border)] text-f1 rounded-lg px-3 py-2 text-sm appearance-none cursor-pointer"
            >
              {[2024, 2023].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold block mb-1.5">Session</label>
            <div className="flex gap-1">
              {(["Qualifying", "Race"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setSessionType(t); setSelectedSession(null); }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border",
                    sessionType === t
                      ? "bg-racing-blue/15 border-racing-blue/30 text-racing-blue"
                      : "border-[var(--f1-border)] text-f1-muted hover:text-f1-sub"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold block mb-1.5">Grand Prix</label>
            <div className="relative">
              <select
                value={selectedSession?.session_key || ""}
                onChange={(e) => {
                  const s = sessions.find((s) => s.session_key === Number(e.target.value));
                  setSelectedSession(s || null);
                }}
                className="w-full bg-[var(--f1-hover)] border border-[var(--f1-border)] text-f1 rounded-lg px-3 py-2 text-sm appearance-none cursor-pointer pr-8"
                disabled={loadingSessions}
              >
                {sessions.map((s) => (
                  <option key={s.session_key} value={s.session_key}>
                    {s.circuit_short_name} — {s.country_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-f1-muted pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Driver Selection */}
      {loadingDrivers ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
        </div>
      ) : drivers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { driver: driver1, setDriver: setDriver1, label: "Driver 1", laps: laps1, selectedLap: selectedLap1, setLap: setSelectedLap1, color: d1Color },
            { driver: driver2, setDriver: setDriver2, label: "Driver 2", laps: laps2, selectedLap: selectedLap2, setLap: setSelectedLap2, color: d2Color },
          ].map((slot) => (
            <div key={slot.label} className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">{slot.label}</span>
                {slot.driver && (
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded" style={{ color: slot.color, backgroundColor: `${slot.color}15` }}>
                    {slot.driver.name_acronym}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {drivers.map((d) => {
                  const c = `#${d.team_colour || "888"}`;
                  const isSelected = slot.driver?.driver_number === d.driver_number;
                  return (
                    <button
                      key={d.driver_number}
                      onClick={() => slot.setDriver(d)}
                      className={cn(
                        "px-2 py-1 rounded-md text-[11px] font-mono font-bold transition-all duration-200 cursor-pointer border",
                        isSelected ? "border-opacity-50" : "border-[var(--f1-border)] text-f1-muted hover:text-f1-sub hover:border-f1"
                      )}
                      style={isSelected ? { backgroundColor: `${c}20`, borderColor: `${c}50`, color: c } : {}}
                    >
                      {d.name_acronym}
                    </button>
                  );
                })}
              </div>

              {slot.laps.length > 0 && (
                <div>
                  <label className="text-[9px] uppercase tracking-widest text-f1-muted font-semibold block mb-1">
                    Lap (fastest auto-selected)
                  </label>
                  <div className="relative">
                    <select
                      value={slot.selectedLap || ""}
                      onChange={(e) => slot.setLap(Number(e.target.value))}
                      className="w-full bg-[var(--f1-hover)] border border-[var(--f1-border)] text-f1 rounded-lg px-3 py-1.5 text-xs font-mono appearance-none cursor-pointer pr-8"
                    >
                      {slot.laps.map((l) => (
                        <option key={l.lap_number} value={l.lap_number}>
                          Lap {l.lap_number} — {formatLapTime(l.lap_duration)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Error */}
      {error && (
        <div className="glass-card p-4 border-racing-red/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-racing-red flex-shrink-0" />
          <p className="text-sm text-racing-red">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loadingTelemetry && (
        <div className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
          <span className="text-sm text-f1-sub">Loading telemetry data...</span>
        </div>
      )}

      {/* Charts */}
      {processedData && !loadingTelemetry && (
        <>
          {/* Metric selector */}
          <div className="flex gap-2 flex-wrap">
            {(["speed", "throttle", "brake", "gear"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer border",
                  metric === m
                    ? "bg-racing-blue/15 border-racing-blue/30 text-racing-blue"
                    : "border-[var(--f1-border)] text-f1-muted hover:text-f1-sub hover:border-f1"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Main chart */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{cfg.label} — Lap Trace</h2>
              <div className="flex items-center gap-4">
                {driver1 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: d1Color }} />
                    <span className="text-[10px] font-mono" style={{ color: d1Color }}>{driver1.name_acronym} L{selectedLap1}</span>
                  </div>
                )}
                {driver2 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: d2Color }} />
                    <span className="text-[10px] font-mono" style={{ color: d2Color }}>{driver2.name_acronym} L{selectedLap2}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={processedData.merged} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--f1-border)" />
                  <XAxis
                    dataKey="pct"
                    tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                    axisLine={{ stroke: "var(--f1-border)" }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    domain={cfg.domain as [number, number]}
                    tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--f1-card)",
                      border: "1px solid var(--f1-border)",
                      borderRadius: "12px",
                      fontFamily: "Fira Code",
                      fontSize: "11px",
                      color: "var(--f1-text)",
                    }}
                    labelFormatter={(v) => `${v}% of lap`}
                  />
                  <Line type="monotone" dataKey={cfg.d1Key} stroke={d1Color} strokeWidth={1.5} dot={false} name={driver1?.name_acronym || "D1"} />
                  <Line type="monotone" dataKey={cfg.d2Key} stroke={d2Color} strokeWidth={1.5} dot={false} name={driver2?.name_acronym || "D2"} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Throttle & Brake */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-racing-green" />
                Throttle Application
              </h2>
              <div className="w-full h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={processedData.merged} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="pct" tick={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "var(--f1-text-dim)", fontSize: 10, fontFamily: "Fira Code" }} axisLine={false} tickLine={false} />
                    <Area type="monotone" dataKey="d1_throttle" stroke={d1Color} fill={d1Color} fillOpacity={0.15} strokeWidth={1} name={driver1?.name_acronym} />
                    <Area type="monotone" dataKey="d2_throttle" stroke={d2Color} fill={d2Color} fillOpacity={0.15} strokeWidth={1} name={driver2?.name_acronym} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <CircleDot className="w-4 h-4 text-racing-red" />
                Brake Application
              </h2>
              <div className="w-full h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={processedData.merged} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="pct" tick={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "var(--f1-text-dim)", fontSize: 10, fontFamily: "Fira Code" }} axisLine={false} tickLine={false} />
                    <Area type="monotone" dataKey="d1_brake" stroke="#E10600" fill="#E10600" fillOpacity={0.2} strokeWidth={1} name={driver1?.name_acronym} />
                    <Area type="monotone" dataKey="d2_brake" stroke="#FF6B6B" fill="#FF6B6B" fillOpacity={0.15} strokeWidth={1} name={driver2?.name_acronym} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-racing-amber" />
                Lap Comparison
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Lap Time", v1: formatLapTime(stats.d1.lapTime), v2: formatLapTime(stats.d2.lapTime), unit: "" },
                  { label: "Max Speed", v1: `${stats.d1.maxSpeed}`, v2: `${stats.d2.maxSpeed}`, unit: "km/h" },
                  { label: "Avg Speed", v1: `${stats.d1.avgSpeed}`, v2: `${stats.d2.avgSpeed}`, unit: "km/h" },
                  { label: "Max RPM", v1: `${stats.d1.maxRPM}`, v2: `${stats.d2.maxRPM}`, unit: "rpm" },
                ].map((s) => (
                  <div key={s.label} className="text-center space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-f1-muted">{s.label}</div>
                    <div className="flex items-center justify-center gap-3">
                      <div>
                        <div className="font-mono text-lg font-bold" style={{ color: d1Color }}>{s.v1}</div>
                        <div className="text-[10px] font-mono text-[var(--f1-text-dim)]">{driver1?.name_acronym}</div>
                      </div>
                      <div className="text-[var(--f1-text-dim)] text-xs">vs</div>
                      <div>
                        <div className="font-mono text-lg font-bold" style={{ color: d2Color }}>{s.v2}</div>
                        <div className="text-[10px] font-mono text-[var(--f1-text-dim)]">{driver2?.name_acronym}</div>
                      </div>
                    </div>
                    {s.unit && <div className="text-[10px] text-[var(--f1-text-dim)] font-mono">{s.unit}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!processedData && !loadingTelemetry && !error && driver1 && driver2 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <BarChart3 className="w-12 h-12 text-f1-muted" />
          <p className="text-f1-sub text-sm text-center max-w-md">
            Select a session and drivers above. Telemetry will load automatically for the fastest lap.
          </p>
        </div>
      )}
    </div>
  );
}
