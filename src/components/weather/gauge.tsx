"use client";

interface GaugeProps {
  /** Current value. */
  value: number;
  /** Scale bounds. */
  min: number;
  max: number;
  /** Short label under the value (e.g. "Track Temp"). */
  label: string;
  /** Unit suffix rendered after the value (e.g. "°C", "%"). */
  unit?: string;
  /** Arc color (defaults to F1 red). */
  color?: string;
  /** Decimal places for the displayed value. */
  decimals?: number;
}

const SIZE = 96;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
// 270° sweep (a "broadcast complication" dial), gap at the bottom.
const START_ANGLE = 135;
const SWEEP = 270;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = (SWEEP / 360) * CIRCUMFERENCE;

/**
 * Compact circular gauge for weather "complications" (track temp, humidity,
 * wind, rain). Pure SVG arc math — the fill sweeps 270° proportional to
 * value within [min, max]. Renders nothing heavier than two <circle>s.
 */
export default function Gauge({
  value,
  min,
  max,
  label,
  unit = "",
  color = "#e10600",
  decimals = 0,
}: GaugeProps) {
  const span = max - min || 1;
  const pct = Math.max(0, Math.min(1, (value - min) / span));
  const dash = pct * ARC_LENGTH;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ transform: `rotate(${START_ANGLE}deg)` }}
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--f1-border)"
            strokeWidth={STROKE}
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold text-f1 leading-none"
            style={{ fontVariantNumeric: "tabular-nums", fontSize: 18 }}
          >
            {value.toFixed(decimals)}
            <span className="text-f1-muted text-[10px] ml-0.5">{unit}</span>
          </span>
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold text-center">
        {label}
      </span>
    </div>
  );
}
