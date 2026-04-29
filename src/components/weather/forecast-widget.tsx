"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getCircuitCoords } from "@/lib/circuit-coords";
import { CloudRain, Droplets, Wind, Thermometer } from "lucide-react";

interface ForecastPoint {
  time: string;
  temp: number;
  precipMm: number;
  precipProb: number;
  windKph: number;
}

export interface ForecastWidgetProps {
  circuitShortName: string;
  hours?: number;
  className?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ready"; points: ForecastPoint[] };

/** Map a 0..100 precipitation probability to a discrete blue shade. We use
 *  fixed steps rather than a continuous gradient so adjacent bars are
 *  visibly different — a pixel-thin bar with HSL interpolation reads as
 *  a single flat color. */
function precipColor(prob: number): string {
  if (prob <= 5) return "rgba(255,255,255,0.06)";
  if (prob < 20) return "#1E3A8A"; // blue-900-ish dim
  if (prob < 40) return "#2563EB"; // blue-600
  if (prob < 60) return "#3B82F6"; // blue-500
  if (prob < 80) return "#60A5FA"; // blue-400
  return "#93C5FD"; // blue-300 — heavy rain warning
}

export default function ForecastWidget({
  circuitShortName,
  hours = 24,
  className,
}: ForecastWidgetProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Resolve the user-facing label without waiting for the network.
  const circuit = getCircuitCoords(circuitShortName);
  const headerLabel = circuit?.label ?? circuitShortName;

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    const params = new URLSearchParams({
      circuit: circuitShortName,
      hours: String(hours),
    });
    fetch(`/api/weather/forecast?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status=${res.status}`);
        return (await res.json()) as ForecastPoint[];
      })
      .then((points) => {
        if (cancelled) return;
        if (!Array.isArray(points) || points.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        setState({ kind: "ready", points });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [circuitShortName, hours]);

  return (
    <div className={cn("glass-card p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        <CloudRain className="w-4 h-4 text-f1-red" />
        <span className="ferrari-label font-semibold">
          Weekend Forecast · {headerLabel}
        </span>
      </div>

      {state.kind === "loading" && <ForecastSkeleton />}
      {state.kind === "error" && (
        <p className="text-ferrari-caption text-f1-muted text-center py-4">
          Forecast unavailable
        </p>
      )}
      {state.kind === "empty" && (
        <p className="text-ferrari-caption text-f1-muted text-center py-4">
          No data
        </p>
      )}
      {state.kind === "ready" && <ForecastBody points={state.points} />}
    </div>
  );
}

function ForecastSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 rounded-ferrari bg-[rgba(255,255,255,0.04)]"
          />
        ))}
      </div>
      <div className="h-4 rounded-ferrari bg-[rgba(255,255,255,0.04)]" />
    </div>
  );
}

function ForecastBody({ points }: { points: ForecastPoint[] }) {
  // Aggregates over the full window — these are what most viewers actually
  // want to see ("does it rain this weekend, how hard, how windy").
  const peakRainProb = Math.max(0, ...points.map((p) => p.precipProb));
  const peakRainMm = Math.max(0, ...points.map((p) => p.precipMm));
  const maxWind = Math.max(0, ...points.map((p) => p.windKph));
  const minTemp = Math.min(...points.map((p) => p.temp));
  const maxTemp = Math.max(...points.map((p) => p.temp));

  // Down-sample to 24 evenly-spaced bars regardless of `hours`. That keeps
  // the chart readable at any window length without exploding pixel width
  // on mobile when hours=168.
  const TARGET_BARS = 24;
  const step = Math.max(1, points.length / TARGET_BARS);
  const bars: ForecastPoint[] = [];
  for (let i = 0; i < TARGET_BARS && Math.floor(i * step) < points.length; i++) {
    bars.push(points[Math.floor(i * step)]);
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Stat
          icon={<CloudRain className="w-3.5 h-3.5" />}
          label="Peak rain"
          value={`${peakRainProb}%`}
          accent="#3B82F6"
        />
        <Stat
          icon={<Droplets className="w-3.5 h-3.5" />}
          label="Max rain"
          value={`${peakRainMm.toFixed(1)} mm`}
          accent="#60A5FA"
        />
        <Stat
          icon={<Wind className="w-3.5 h-3.5" />}
          label="Max wind"
          value={`${maxWind} km/h`}
          accent="#A3A3A3"
        />
        <Stat
          icon={<Thermometer className="w-3.5 h-3.5" />}
          label="Temp range"
          value={`${Math.round(minTemp)}–${Math.round(maxTemp)}°C`}
          accent="#e10600"
        />
      </div>

      <div>
        <div
          className="text-ferrari-micro text-f1-muted mb-1.5"
          style={{ letterSpacing: "0.083em", textTransform: "uppercase" }}
        >
          Precip · next {points.length}h
        </div>
        <div
          className="flex items-end gap-[2px] h-8 rounded-ferrari overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
          role="img"
          aria-label="Precipitation probability over time"
        >
          {bars.map((b, i) => {
            // Bar height tracks probability so eye picks up rain windows
            // even when adjacent shade steps look similar.
            const heightPct = Math.max(8, b.precipProb);
            const t = b.time
              ? new Date(b.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
            return (
              <div
                key={`${b.time}-${i}`}
                title={`${t}: ${b.precipProb}% rain · ${b.precipMm.toFixed(1)} mm`}
                style={{
                  flex: 1,
                  height: `${heightPct}%`,
                  backgroundColor: precipColor(b.precipProb),
                  minWidth: 2,
                  transition: "height 200ms ease-out",
                }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-ferrari px-2.5 py-2"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        borderLeft: `2px solid ${accent}`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-0.5" style={{ color: accent }}>
        {icon}
        <span
          className="text-ferrari-micro"
          style={{
            letterSpacing: "0.083em",
            textTransform: "uppercase",
            color: "var(--f1-muted, #8F8F8F)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="font-mono text-[13px] font-semibold"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}
