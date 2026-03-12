"use client";

import { useState, useMemo } from "react";
import { Activity, Gauge, Zap, CircleDot } from "lucide-react";
import { cn, getTeamColor, getTireColor } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, ComposedChart, Bar,
} from "recharts";

// Generate realistic telemetry for a lap
function generateTelemetry(driverCode: string, team: string) {
  const points = 500;
  const data = [];
  const baseSpeed: Record<string, number> = { VER: 310, NOR: 307, LEC: 308, HAM: 305, PIA: 306 };
  const base = baseSpeed[driverCode] || 300;

  for (let i = 0; i < points; i++) {
    const pct = i / points;
    // Simulate a lap: straights, braking zones, corners, acceleration
    const section = pct * 10;
    let speed, throttle, brake, gear, drs;

    if (section % 2 < 0.3) {
      // Braking zone
      speed = base - 120 + Math.random() * 10;
      throttle = 0;
      brake = 80 + Math.random() * 20;
      gear = 2 + Math.floor(Math.random() * 2);
      drs = 0;
    } else if (section % 2 < 0.8) {
      // Corner
      speed = base - 80 + Math.sin(pct * 20) * 30 + Math.random() * 5;
      throttle = 30 + Math.random() * 40;
      brake = Math.random() * 15;
      gear = 3 + Math.floor(Math.random() * 3);
      drs = 0;
    } else {
      // Straight
      speed = base + Math.sin(pct * 3) * 15 + Math.random() * 8;
      throttle = 95 + Math.random() * 5;
      brake = 0;
      gear = 7 + Math.floor(Math.random() * 2);
      drs = section > 3 && section < 5 ? 1 : 0;
    }

    data.push({
      distance: Math.round((i / points) * 5412),
      speed: Math.round(speed),
      throttle: Math.round(Math.max(0, Math.min(100, throttle))),
      brake: Math.round(Math.max(0, Math.min(100, brake))),
      gear: Math.min(8, Math.max(1, gear)),
      drs,
      rpm: Math.round(speed * 35 + Math.random() * 500),
    });
  }
  return data;
}

const DRIVERS = [
  { code: "VER", name: "Max Verstappen", team: "Red Bull Racing" },
  { code: "NOR", name: "Lando Norris", team: "McLaren" },
  { code: "LEC", name: "Charles Leclerc", team: "Ferrari" },
  { code: "HAM", name: "Lewis Hamilton", team: "Mercedes" },
  { code: "PIA", name: "Oscar Piastri", team: "McLaren" },
  { code: "SAI", name: "Carlos Sainz", team: "Ferrari" },
  { code: "RUS", name: "George Russell", team: "Mercedes" },
  { code: "ALO", name: "Fernando Alonso", team: "Aston Martin" },
];

export default function TelemetryPage() {
  const [driver1, setDriver1] = useState("VER");
  const [driver2, setDriver2] = useState("NOR");
  const [metric, setMetric] = useState<"speed" | "throttle" | "brake" | "gear">("speed");

  const d1Info = DRIVERS.find((d) => d.code === driver1)!;
  const d2Info = DRIVERS.find((d) => d.code === driver2)!;
  const d1Color = getTeamColor(d1Info.team);
  const d2Color = getTeamColor(d2Info.team);

  const telem1 = useMemo(() => generateTelemetry(driver1, d1Info.team), [driver1]);
  const telem2 = useMemo(() => generateTelemetry(driver2, d2Info.team), [driver2]);

  // Merge telemetry data
  const mergedData = useMemo(() => {
    return telem1.map((t, i) => ({
      distance: t.distance,
      [`${driver1}_${metric}`]: t[metric],
      [`${driver2}_${metric}`]: telem2[i]?.[metric] || 0,
      [`${driver1}_throttle`]: t.throttle,
      [`${driver2}_throttle`]: telem2[i]?.throttle || 0,
      [`${driver1}_brake`]: t.brake,
      [`${driver2}_brake`]: telem2[i]?.brake || 0,
      [`${driver1}_gear`]: t.gear,
      [`${driver2}_gear`]: telem2[i]?.gear || 0,
      delta: (t[metric] as number) - ((telem2[i]?.[metric] as number) || 0),
    }));
  }, [telem1, telem2, driver1, driver2, metric]);

  const metricConfig = {
    speed: { label: "Speed (km/h)", unit: "km/h", domain: [80, 360] },
    throttle: { label: "Throttle (%)", unit: "%", domain: [0, 100] },
    brake: { label: "Brake Pressure (%)", unit: "%", domain: [0, 100] },
    gear: { label: "Gear", unit: "", domain: [0, 9] },
  };

  const cfg = metricConfig[metric];

  // Stats comparison
  const stats1 = {
    maxSpeed: Math.max(...telem1.map((t) => t.speed)),
    avgSpeed: Math.round(telem1.reduce((a, b) => a + b.speed, 0) / telem1.length),
    maxRPM: Math.max(...telem1.map((t) => t.rpm)),
    drsLaps: telem1.filter((t) => t.drs).length,
  };
  const stats2 = {
    maxSpeed: Math.max(...telem2.map((t) => t.speed)),
    avgSpeed: Math.round(telem2.reduce((a, b) => a + b.speed, 0) / telem2.length),
    maxRPM: Math.max(...telem2.map((t) => t.rpm)),
    drsLaps: telem2.filter((t) => t.drs).length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Activity className="w-7 h-7 text-racing-blue" />
          Telemetry Lab
        </h1>
        <p className="text-sm text-white/40 mt-1">Head-to-head driver telemetry comparison</p>
      </div>

      {/* Driver Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { driver: driver1, setDriver: setDriver1, label: "Driver 1", color: d1Color },
          { driver: driver2, setDriver: setDriver2, label: "Driver 2", color: d2Color },
        ].map((slot) => (
          <div key={slot.label} className="glass-card p-4">
            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">{slot.label}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {DRIVERS.map((d) => (
                <button
                  key={d.code}
                  onClick={() => slot.setDriver(d.code)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all duration-200 cursor-pointer border",
                    slot.driver === d.code
                      ? "border-opacity-50 bg-opacity-20"
                      : "border-white/5 text-white/40 hover:text-white/70 hover:border-white/10"
                  )}
                  style={
                    slot.driver === d.code
                      ? { backgroundColor: `${getTeamColor(d.team)}20`, borderColor: `${getTeamColor(d.team)}50`, color: getTeamColor(d.team) }
                      : {}
                  }
                >
                  {d.code}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

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
                : "border-white/5 text-white/40 hover:text-white/60 hover:border-white/10"
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Main Telemetry Chart */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">{cfg.label} — Distance Trace</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: d1Color }} />
              <span className="text-[10px] font-mono" style={{ color: d1Color }}>{driver1}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: d2Color }} />
              <span className="text-[10px] font-mono" style={{ color: d2Color }}>{driver2}</span>
            </div>
          </div>
        </div>

        <div className="w-full h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mergedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="distance"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Fira Code" }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`}
              />
              <YAxis
                domain={cfg.domain as [number, number]}
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
                labelFormatter={(v) => `${(Number(v) / 1000).toFixed(2)} km`}
              />
              <Line
                type="monotone"
                dataKey={`${driver1}_${metric}`}
                stroke={d1Color}
                strokeWidth={1.5}
                dot={false}
                name={driver1}
              />
              <Line
                type="monotone"
                dataKey={`${driver2}_${metric}`}
                stroke={d2Color}
                strokeWidth={1.5}
                dot={false}
                name={driver2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Throttle & Brake overlay */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-racing-green" />
            Throttle Application
          </h2>
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergedData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="distance" tick={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "Fira Code" }} axisLine={false} tickLine={false} />
                <Area type="monotone" dataKey={`${driver1}_throttle`} stroke={d1Color} fill={d1Color} fillOpacity={0.15} strokeWidth={1} name={driver1} />
                <Area type="monotone" dataKey={`${driver2}_throttle`} stroke={d2Color} fill={d2Color} fillOpacity={0.15} strokeWidth={1} name={driver2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-racing-red" />
            Brake Pressure
          </h2>
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergedData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="distance" tick={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "Fira Code" }} axisLine={false} tickLine={false} />
                <Area type="monotone" dataKey={`${driver1}_brake`} stroke="#E10600" fill="#E10600" fillOpacity={0.2} strokeWidth={1} name={driver1} />
                <Area type="monotone" dataKey={`${driver2}_brake`} stroke="#FF6B6B" fill="#FF6B6B" fillOpacity={0.15} strokeWidth={1} name={driver2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stats Comparison */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-racing-amber" />
          Lap Comparison
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Max Speed", v1: `${stats1.maxSpeed}`, v2: `${stats2.maxSpeed}`, unit: "km/h" },
            { label: "Avg Speed", v1: `${stats1.avgSpeed}`, v2: `${stats2.avgSpeed}`, unit: "km/h" },
            { label: "Max RPM", v1: `${stats1.maxRPM}`, v2: `${stats2.maxRPM}`, unit: "rpm" },
            { label: "DRS Zones", v1: `${stats1.drsLaps}`, v2: `${stats2.drsLaps}`, unit: "pts" },
          ].map((s) => (
            <div key={s.label} className="text-center space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-white/30">{s.label}</div>
              <div className="flex items-center justify-center gap-3">
                <div>
                  <div className="font-mono text-lg font-bold" style={{ color: d1Color }}>{s.v1}</div>
                  <div className="text-[10px] font-mono text-white/20">{driver1}</div>
                </div>
                <div className="text-white/10 text-xs">vs</div>
                <div>
                  <div className="font-mono text-lg font-bold" style={{ color: d2Color }}>{s.v2}</div>
                  <div className="text-[10px] font-mono text-white/20">{driver2}</div>
                </div>
              </div>
              <div className="text-[10px] text-white/20 font-mono">{s.unit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
