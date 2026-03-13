"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CloudRain, Thermometer, Droplets, Wind, Loader2,
  ChevronDown, AlertTriangle, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Area, Bar,
  Legend,
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

interface WeatherData {
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  wind_direction: number;
  wind_speed: number;
}

interface LapData {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
  date_start: string;
}

interface DriverInfo {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

// ===== Helpers =====
function formatLapTime(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainder = (secs % 60).toFixed(3);
  return mins > 0
    ? `${mins}:${parseFloat(remainder) < 10 ? "0" : ""}${remainder}`
    : `${remainder}s`;
}

function getWeatherAtTime(weather: WeatherData[], targetTime: number): WeatherData | null {
  if (!weather.length) return null;
  let closest = weather[0];
  let minDiff = Math.abs(new Date(weather[0].date).getTime() - targetTime);
  for (const w of weather) {
    const diff = Math.abs(new Date(w.date).getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = w;
    }
  }
  return closest;
}

// ===== Component =====
export default function WeatherPage() {
  const [year, setYear] = useState(2025);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);

  const [weather, setWeather] = useState<WeatherData[]>([]);
  const [laps, setLaps] = useState<LapData[]>([]);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverInfo | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch sessions
  useEffect(() => {
    fetch(`/api/f1/sessions?year=${year}&type=Race`)
      .then((r) => r.json())
      .then((data: SessionInfo[]) => {
        const sorted = Array.isArray(data)
          ? data.sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())
          : [];
        setSessions(sorted);
        if (sorted.length) setSelectedSession(sorted[0]);
      })
      .catch(() => setError("Failed to load sessions"));
  }, [year]);

  // Fetch weather + laps + drivers when session changes
  useEffect(() => {
    if (!selectedSession) return;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/f1/weather?session_key=${selectedSession.session_key}`).then((r) => r.json()),
      fetch(`/api/f1/laps?session_key=${selectedSession.session_key}`).then((r) => r.json()),
      fetch(`/api/f1/drivers?session_key=${selectedSession.session_key}`).then((r) => r.json()),
    ])
      .then(([w, l, d]) => {
        setWeather(Array.isArray(w) ? w : []);
        setLaps(Array.isArray(l) ? l : []);
        const unique = Array.isArray(d)
          ? Array.from(new Map(d.map((x: DriverInfo) => [x.driver_number, x])).values()).sort(
              (a: DriverInfo, b: DriverInfo) => a.driver_number - b.driver_number
            )
          : [];
        setDrivers(unique as DriverInfo[]);
        if (unique.length) setSelectedDriver(unique[0] as DriverInfo);
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, [selectedSession]);

  // ===== Weather timeline (temp + humidity over the race) =====
  const weatherTimeline = useMemo(() => {
    if (!weather.length) return [];
    const sessionStart = new Date(weather[0].date).getTime();
    return weather.map((w) => ({
      minutesSinceStart: Math.round((new Date(w.date).getTime() - sessionStart) / 60000),
      airTemp: w.air_temperature,
      trackTemp: w.track_temperature,
      humidity: w.humidity,
      windSpeed: w.wind_speed,
      rainfall: w.rainfall,
    }));
  }, [weather]);

  // ===== Lap time vs track temp scatter =====
  const lapTempCorrelation = useMemo(() => {
    if (!laps.length || !weather.length || !selectedDriver) return [];

    const driverLaps = laps.filter(
      (l) =>
        l.driver_number === selectedDriver.driver_number &&
        l.lap_duration &&
        !l.is_pit_out_lap &&
        l.lap_duration < 200 // Filter outliers (SC laps, etc)
    );

    return driverLaps.map((l) => {
      const lapTime = l.date_start ? new Date(l.date_start).getTime() : 0;
      const w = getWeatherAtTime(weather, lapTime);
      return {
        lapNumber: l.lap_number,
        lapTime: l.lap_duration!,
        trackTemp: w?.track_temperature || 0,
        airTemp: w?.air_temperature || 0,
        humidity: w?.humidity || 0,
        rainfall: w?.rainfall || 0,
      };
    });
  }, [laps, weather, selectedDriver]);

  // ===== Lap time + track temp overlaid per lap =====
  const lapWeatherOverlay = useMemo(() => {
    if (!lapTempCorrelation.length) return [];
    return lapTempCorrelation.map((d) => ({
      lap: d.lapNumber,
      lapTime: d.lapTime,
      trackTemp: d.trackTemp,
      rainfall: d.rainfall,
    }));
  }, [lapTempCorrelation]);

  // ===== Stats summary =====
  const stats = useMemo(() => {
    if (!weather.length || !lapTempCorrelation.length) return null;
    const temps = weather.map((w) => w.track_temperature);
    const humids = weather.map((w) => w.humidity);
    const winds = weather.map((w) => w.wind_speed);
    const lapTimes = lapTempCorrelation.map((l) => l.lapTime);
    const hadRain = weather.some((w) => w.rainfall > 0);

    return {
      avgTrackTemp: (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1),
      maxTrackTemp: Math.max(...temps).toFixed(1),
      minTrackTemp: Math.min(...temps).toFixed(1),
      avgHumidity: Math.round(humids.reduce((a, b) => a + b, 0) / humids.length),
      maxWind: Math.max(...winds).toFixed(1),
      hadRain,
      fastestLap: Math.min(...lapTimes),
      avgLapTime: lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length,
    };
  }, [weather, lapTempCorrelation]);

  const driverColor = selectedDriver ? `#${selectedDriver.team_colour || "3b82f6"}` : "#3b82f6";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <CloudRain className="w-7 h-7 text-racing-blue" />
          Weather Impact
        </h1>
        <p className="text-sm text-f1-muted mt-1">
          How track conditions affect lap times — temperature, humidity, rain, and wind
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
              {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <label className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold block mb-1.5">Grand Prix</label>
            <div className="relative">
              <select
                value={selectedSession?.session_key || ""}
                onChange={(e) => {
                  const s = sessions.find((s) => s.session_key === Number(e.target.value));
                  setSelectedSession(s || null);
                }}
                className="w-full bg-[var(--f1-hover)] border border-[var(--f1-border)] text-f1 rounded-lg px-3 py-2 text-sm appearance-none cursor-pointer pr-8"
              >
                {sessions.map((s) => (
                  <option key={s.session_key} value={s.session_key}>
                    {s.circuit_short_name} — {s.country_name} ({s.session_name})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-f1-muted pointer-events-none" />
            </div>
          </div>

          {/* Driver filter */}
          {drivers.length > 0 && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold block mb-1.5">Driver</label>
              <div className="flex flex-wrap gap-1">
                {drivers.slice(0, 10).map((d) => {
                  const c = `#${d.team_colour || "888"}`;
                  const isSelected = selectedDriver?.driver_number === d.driver_number;
                  return (
                    <button
                      key={d.driver_number}
                      onClick={() => setSelectedDriver(d)}
                      className={cn(
                        "px-2 py-1.5 rounded-md text-[11px] font-mono font-bold transition-all duration-200 cursor-pointer border",
                        isSelected ? "" : "border-[var(--f1-border)] text-f1-muted hover:text-f1-sub"
                      )}
                      style={isSelected ? { backgroundColor: `${c}20`, borderColor: `${c}50`, color: c } : {}}
                    >
                      {d.name_acronym}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card p-4 border-racing-red/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-racing-red flex-shrink-0" />
          <p className="text-sm text-racing-red">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-racing-blue" />
          <span className="text-sm text-f1-sub">Loading weather & lap data...</span>
        </div>
      )}

      {/* Content */}
      {!loading && weather.length > 0 && (
        <>
          {/* Stats cards */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Thermometer, color: "text-racing-red", label: "Avg Track Temp", value: `${stats.avgTrackTemp}°C`, sub: `${stats.minTrackTemp}° — ${stats.maxTrackTemp}°` },
                { icon: Droplets, color: "text-racing-blue", label: "Avg Humidity", value: `${stats.avgHumidity}%`, sub: stats.hadRain ? "Rain detected" : "Dry session" },
                { icon: Wind, color: "text-f1-sub", label: "Max Wind", value: `${stats.maxWind} m/s`, sub: "" },
                { icon: TrendingUp, color: "text-racing-green", label: "Fastest Lap", value: formatLapTime(stats.fastestLap), sub: `Avg: ${formatLapTime(stats.avgLapTime)}` },
              ].map((card) => (
                <div key={card.label} className="glass-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <card.icon className={cn("w-4 h-4", card.color)} />
                    <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">{card.label}</span>
                  </div>
                  <div className="font-mono text-xl font-bold text-f1">{card.value}</div>
                  {card.sub && <div className="text-[11px] text-f1-muted mt-1">{card.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Weather timeline */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-racing-red" />
              Track Conditions Over Time
            </h2>
            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weatherTimeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--f1-border)" />
                  <XAxis
                    dataKey="minutesSinceStart"
                    tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                    axisLine={{ stroke: "var(--f1-border)" }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}m`}
                  />
                  <YAxis
                    yAxisId="temp"
                    tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}°`}
                  />
                  <YAxis
                    yAxisId="humidity"
                    orientation="right"
                    tick={{ fill: "var(--f1-text-dim)", fontSize: 10, fontFamily: "Fira Code" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
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
                    labelFormatter={(v) => `${v} min`}
                  />
                  <Line yAxisId="temp" type="monotone" dataKey="trackTemp" stroke="#E10600" strokeWidth={2} dot={false} name="Track °C" />
                  <Line yAxisId="temp" type="monotone" dataKey="airTemp" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Air °C" strokeDasharray="4 2" />
                  <Area yAxisId="humidity" type="monotone" dataKey="humidity" stroke="transparent" fill="#3b82f6" fillOpacity={0.08} name="Humidity %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lap time + track temp overlay */}
          {lapWeatherOverlay.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-racing-green" />
                Lap Time vs Track Temperature
                {selectedDriver && (
                  <span className="text-[10px] font-mono ml-2 px-2 py-0.5 rounded" style={{ color: driverColor, backgroundColor: `${driverColor}15` }}>
                    {selectedDriver.name_acronym}
                  </span>
                )}
              </h2>
              <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={lapWeatherOverlay} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--f1-border)" />
                    <XAxis
                      dataKey="lap"
                      tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                      axisLine={{ stroke: "var(--f1-border)" }}
                      tickLine={false}
                      label={{ value: "Lap", position: "insideBottomRight", offset: -5, fill: "var(--f1-text-dim)", fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="time"
                      tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatLapTime(v)}
                      domain={["auto", "auto"]}
                    />
                    <YAxis
                      yAxisId="temp"
                      orientation="right"
                      tick={{ fill: "var(--f1-text-dim)", fontSize: 10, fontFamily: "Fira Code" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}°`}
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
                      formatter={(value: number, name: string) => {
                        if (name === "Lap Time") return [formatLapTime(value), name];
                        if (name === "Track °C") return [`${value.toFixed(1)}°C`, name];
                        return [value, name];
                      }}
                      labelFormatter={(v) => `Lap ${v}`}
                    />
                    <Line yAxisId="time" type="monotone" dataKey="lapTime" stroke={driverColor} strokeWidth={2} dot={{ r: 2, fill: driverColor }} name="Lap Time" />
                    <Line yAxisId="temp" type="monotone" dataKey="trackTemp" stroke="#E10600" strokeWidth={1.5} dot={false} name="Track °C" strokeDasharray="4 2" />
                    {lapWeatherOverlay.some((d) => d.rainfall > 0) && (
                      <Bar yAxisId="temp" dataKey="rainfall" fill="#3b82f6" fillOpacity={0.3} name="Rainfall" />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Scatter: Track Temp vs Lap Time */}
          {lapTempCorrelation.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="glass-card p-5">
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-racing-red" />
                  Track Temp vs Lap Time
                </h2>
                <div className="w-full h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--f1-border)" />
                      <XAxis
                        dataKey="trackTemp"
                        type="number"
                        tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                        axisLine={{ stroke: "var(--f1-border)" }}
                        tickLine={false}
                        name="Track °C"
                        tickFormatter={(v) => `${v}°`}
                      />
                      <YAxis
                        dataKey="lapTime"
                        type="number"
                        tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                        axisLine={false}
                        tickLine={false}
                        name="Lap Time"
                        tickFormatter={(v) => formatLapTime(v)}
                        domain={["auto", "auto"]}
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
                        formatter={(value: number, name: string) => {
                          if (name === "Lap Time") return [formatLapTime(value), name];
                          return [`${value.toFixed(1)}°C`, name];
                        }}
                      />
                      <Scatter data={lapTempCorrelation} fill={driverColor} fillOpacity={0.7} r={4} name="Lap Time" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-card p-5">
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-racing-blue" />
                  Humidity vs Lap Time
                </h2>
                <div className="w-full h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--f1-border)" />
                      <XAxis
                        dataKey="humidity"
                        type="number"
                        tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                        axisLine={{ stroke: "var(--f1-border)" }}
                        tickLine={false}
                        name="Humidity %"
                        tickFormatter={(v) => `${v}%`}
                      />
                      <YAxis
                        dataKey="lapTime"
                        type="number"
                        tick={{ fill: "var(--f1-text-sub)", fontSize: 10, fontFamily: "Fira Code" }}
                        axisLine={false}
                        tickLine={false}
                        name="Lap Time"
                        tickFormatter={(v) => formatLapTime(v)}
                        domain={["auto", "auto"]}
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
                        formatter={(value: number, name: string) => {
                          if (name === "Lap Time") return [formatLapTime(value), name];
                          return [`${value}%`, name];
                        }}
                      />
                      <Scatter data={lapTempCorrelation} fill="#3b82f6" fillOpacity={0.7} r={4} name="Lap Time" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
