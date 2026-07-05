"use client";

import { useEffect, useState } from "react";
import { Disc, Gauge, Activity, Timer } from "lucide-react";
import { cn, getTireColor } from "@/lib/utils";
import { getCircuitCoords } from "@/lib/circuit-coords";
import type { CompoundAllocation } from "@/data/pirelli-compounds";

export interface CompoundPreviewProps {
  /** OpenF1 `circuit_short_name` — same key the rest of the dashboard uses. */
  circuitShortName: string;
  className?: string;
}

interface PreviewResponse {
  allocation: CompoundAllocation | null;
  source: "static";
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ready"; allocation: CompoundAllocation; source: "static" };

/** Visual identity for each compound tier — mirrors F1's broadcast colour code. */
type Tier = "HARD" | "MEDIUM" | "SOFT";

interface TierVisual {
  label: Tier;
  /** Outer ring colour — the recognisable broadcast hue. */
  ringColor: string;
  /** Code text colour — black on light rings (hard), white on coloured ones. */
  textColor: string;
  /** Inner fill — same as ring but at low alpha so the chip reads as one piece. */
  fillColor: string;
}

function getTierVisuals(label: Tier): TierVisual {
  const ring = getTireColor(label);
  // Light discs (HARD's near-white, MEDIUM's yellow) need dark text —
  // white-on-yellow was ~1.6:1 contrast, effectively illegible.
  const textColor =
    label === "HARD" || label === "MEDIUM" ? "#1a1a1a" : "#FFFFFF";
  return {
    label,
    ringColor: ring,
    textColor,
    fillColor: ring,
  };
}

/** Map abrasion rating to a 0..1 marker position on the gradient bar. */
function abrasionMarkerPct(level: CompoundAllocation["abrasion"]): number {
  if (level === "low") return 16;
  if (level === "medium") return 50;
  return 84; // high
}

export default function CompoundPreview({
  circuitShortName,
  className,
}: CompoundPreviewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Resolve the user-facing label without waiting for the network — gives
  // the header a real circuit name from the very first paint.
  const circuit = getCircuitCoords(circuitShortName);
  const headerLabel = circuit?.label ?? circuitShortName;

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    const params = new URLSearchParams({ circuit: circuitShortName });
    fetch(`/api/pirelli/preview?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status=${res.status}`);
        return (await res.json()) as PreviewResponse;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data || !data.allocation) {
          setState({ kind: "empty" });
          return;
        }
        setState({
          kind: "ready",
          allocation: data.allocation,
          source: data.source,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [circuitShortName]);

  return (
    <div className={cn("glass-card p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Disc className="w-4 h-4 text-f1-red" />
        <span className="ferrari-label font-semibold">
          Pirelli Compounds · {headerLabel}
        </span>
      </div>

      {state.kind === "loading" && <PreviewSkeleton />}
      {state.kind === "error" && (
        <p className="text-ferrari-caption text-f1-muted text-center py-4">
          Compound preview unavailable
        </p>
      )}
      {state.kind === "empty" && (
        <p className="text-ferrari-caption text-f1-muted text-center py-4">
          No data for this circuit
        </p>
      )}
      {state.kind === "ready" && <PreviewBody allocation={state.allocation} />}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-ferrari bg-[rgba(255,255,255,0.04)]"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="h-12 rounded-ferrari bg-[rgba(255,255,255,0.04)]" />
        <div className="h-12 rounded-ferrari bg-[rgba(255,255,255,0.04)]" />
      </div>
      <div className="h-4 rounded-ferrari bg-[rgba(255,255,255,0.04)]" />
    </div>
  );
}

function PreviewBody({ allocation }: { allocation: CompoundAllocation }) {
  const tiers: { tier: Tier; code: string }[] = [
    { tier: "HARD", code: allocation.hard },
    { tier: "MEDIUM", code: allocation.medium },
    { tier: "SOFT", code: allocation.soft },
  ];

  return (
    <>
      {/* Tire chips — three tiers, each with its compound code on a
          colour-coded disc. Sized for legibility on mobile (375px). */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {tiers.map(({ tier, code }) => (
          <TireChip key={tier} tier={tier} code={code} />
        ))}
      </div>

      {/* Min pressures — front/rear in a compact grid. Match ForecastWidget's
          Stat-card visual language so the two widgets sit cleanly side-by-side. */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <PressureStat
          label="Front psi"
          value={
            allocation.minStartPressureFrontPsi != null
              ? allocation.minStartPressureFrontPsi.toFixed(1)
              : "—"
          }
          accent="#3B82F6"
        />
        <PressureStat
          label="Rear psi"
          value={
            allocation.minStartPressureRearPsi != null
              ? allocation.minStartPressureRearPsi.toFixed(1)
              : "—"
          }
          accent="#60A5FA"
        />
      </div>

      {/* Track abrasion gradient bar — visual cue for how aggressive a
          soft-compound strategy can be. Marker position derives from the
          rating, gradient runs cool → hot left to right. */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div
            className="text-ferrari-micro text-f1-muted flex items-center gap-1.5"
            style={{ letterSpacing: "0.083em", textTransform: "uppercase" }}
          >
            <Activity className="w-3 h-3" />
            Track abrasion
          </div>
          <span
            className="text-[10px] font-mono font-bold uppercase"
            style={{ color: abrasionTextColor(allocation.abrasion) }}
          >
            {allocation.abrasion}
          </span>
        </div>
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{
            background:
              "linear-gradient(90deg, #2563EB 0%, #FFC906 50%, #e10600 100%)",
          }}
          role="img"
          aria-label={`Track abrasion: ${allocation.abrasion}`}
        >
          {/* Marker pin — 2px-wide vertical bar, white with subtle shadow so
              it reads against any band of the gradient. */}
          <div
            className="absolute top-0 bottom-0 w-[3px] bg-white"
            style={{
              left: `calc(${abrasionMarkerPct(allocation.abrasion)}% - 1.5px)`,
              boxShadow: "0 0 6px rgba(0,0,0,0.4)",
            }}
          />
        </div>
      </div>

      {/* Estimated stint pill — only render when we have a real number,
          rather than a dash that suggests a value we don't have. */}
      {allocation.estimatedMediumStintLaps != null && (
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            backgroundColor: "rgba(255,201,6,0.08)",
            border: "1px solid rgba(255,201,6,0.2)",
          }}
        >
          <Timer className="w-3 h-3" style={{ color: "#FFC906" }} />
          <span
            className="text-ferrari-micro"
            style={{
              letterSpacing: "0.083em",
              textTransform: "uppercase",
              color: "var(--f1-muted, #8F8F8F)",
            }}
          >
            Med stint
          </span>
          <span
            className="font-mono text-[12px] font-semibold"
            style={{ color: "#FFC906", fontVariantNumeric: "tabular-nums" }}
          >
            ~{allocation.estimatedMediumStintLaps} laps
          </span>
        </div>
      )}
    </>
  );
}

function TireChip({ tier, code }: { tier: Tier; code: string }) {
  const visual = getTierVisuals(tier);
  return (
    <div
      className="flex flex-col items-center justify-center rounded-ferrari py-3 px-2"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        borderLeft: `2px solid ${visual.ringColor}`,
      }}
    >
      {/* Compound disc — outer ring carries the broadcast colour, inner
          fill holds the C-code text. Sizes scale a touch on sm+ but stay
          tappable at 375px. */}
      <div
        className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: visual.fillColor,
          // For HARD (white) we add a faint inner border so it doesn't
          // visually merge with the card on light themes.
          boxShadow:
            tier === "HARD"
              ? "inset 0 0 0 1px rgba(0,0,0,0.15), 0 0 8px rgba(255,255,255,0.05)"
              : `0 0 10px ${visual.ringColor}40`,
        }}
      >
        <span
          className="font-mono font-bold text-[13px] sm:text-sm"
          style={{ color: visual.textColor }}
        >
          {code}
        </span>
      </div>
      <span
        className="text-ferrari-micro mt-1.5"
        style={{
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--f1-muted, #8F8F8F)",
        }}
      >
        {tier}
      </span>
    </div>
  );
}

function PressureStat({
  label,
  value,
  accent,
}: {
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
        <Gauge className="w-3.5 h-3.5" />
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

function abrasionTextColor(level: CompoundAllocation["abrasion"]): string {
  if (level === "low") return "#3B82F6";
  if (level === "medium") return "#FFC906";
  return "#e10600";
}
