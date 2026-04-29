"use client";

import { useMemo } from "react";
import { cn, formatGap, getTireColor } from "@/lib/utils";
import { projectPitWindow } from "@/lib/pit-window";

interface PitWindowProps {
  selectedDriver: {
    code: string;
    teamColor: string;
    driverNumber: number;
  } | null;
  /** Current gap to leader in seconds. Null = unknown / driver is leader. */
  currentGap: number | null;
  /** Laps remaining in the race. */
  lapsRemaining: number;
  /** Circuit short name for the pit-loss lookup. */
  circuitShortName: string;
  /** Laps already covered on current set of tyres. */
  tireAge: number;
  /** Compound currently fitted. */
  compound: string;
}

/**
 * Render a metric value formatted as a signed gap in seconds, with the
 * caller's sign convention preserved.
 */
function formatSeconds(value: number, signed = false): string {
  if (!Number.isFinite(value)) return "—";
  if (signed) {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}s`;
  }
  return `${value.toFixed(1)}s`;
}

export default function PitWindowPredictor({
  selectedDriver,
  currentGap,
  lapsRemaining,
  circuitShortName,
  tireAge,
  compound,
}: PitWindowProps) {
  const compoundUpper = (compound || "UNKNOWN").toUpperCase();

  // Estimate degradation rate from tyre age and compound. This is a
  // coarse heuristic — real strategy systems use stint regression — but
  // it's enough to make the prediction directional.
  // Soft fades faster, hard the slowest. Each extra lap of age adds a
  // small amount of expected degradation.
  const tireDegPerLap = useMemo(() => {
    const compoundBase: Record<string, number> = {
      SOFT: 0.07,
      MEDIUM: 0.05,
      HARD: 0.035,
      INTERMEDIATE: 0.06,
      WET: 0.06,
      UNKNOWN: 0.05,
    };
    const base = compoundBase[compoundUpper] ?? 0.05;
    const ageBonus = Math.max(0, tireAge - 8) * 0.005;
    return base + ageBonus;
  }, [compoundUpper, tireAge]);

  // Empty / no-selection state.
  if (!selectedDriver) {
    return (
      <div className="glass-card w-full max-w-full lg:max-w-[320px] p-4">
        <div className="text-ferrari-label text-[10px] mb-2">Pit Window</div>
        <p className="text-f1-muted text-xs leading-relaxed">
          Select a driver to see pit-window prediction
        </p>
      </div>
    );
  }

  const safeGap = currentGap ?? 0;
  const prediction = projectPitWindow({
    currentGapToLeader: safeGap,
    lapsRemaining,
    circuitShortName,
    tireDegPerLap,
  });

  let badgeLabel = "—";
  let badgeClasses = "text-f1-muted bg-white/5 border border-white/10";
  if (prediction.isUndercut) {
    badgeLabel = "UNDERCUT";
    badgeClasses = "text-racing-green bg-racing-green/10 border border-racing-green/30";
  } else if (!prediction.isOvercut) {
    // Per spec: amber "OVERCUT" tag when isOvercut is FALSE.
    badgeLabel = "OVERCUT";
    badgeClasses = "text-racing-amber bg-racing-amber/10 border border-racing-amber/30";
  }

  return (
    <div className="glass-card w-full max-w-full lg:max-w-[320px] p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-ferrari-label text-[10px] mb-1">Pit Window</div>
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-sm font-bold"
              style={{ color: selectedDriver.teamColor }}
            >
              {selectedDriver.code}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: getTireColor(compoundUpper) }}
                aria-hidden
              />
              <span className="text-f1-sub text-[11px] font-mono">
                {compoundUpper.charAt(0)} · {tireAge}L
              </span>
            </span>
          </div>
        </div>
        <div
          className={cn(
            "px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-wider",
            badgeClasses,
          )}
        >
          {badgeLabel}
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-ferrari-label text-[9px] mb-1">Pit Loss</div>
          <div className="text-f1 font-mono text-sm sm:text-base font-bold">
            {formatSeconds(prediction.pitLossSeconds)}
          </div>
        </div>
        <div className="text-center border-x border-white/5">
          <div className="text-ferrari-label text-[9px] mb-1">If Pit Now</div>
          <div className="text-f1 font-mono text-sm sm:text-base font-bold">
            {formatGap(prediction.gapAfterPit) || formatSeconds(prediction.gapAfterPit)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-ferrari-label text-[9px] mb-1">Projected</div>
          <div
            className={cn(
              "font-mono text-sm sm:text-base font-bold",
              prediction.isUndercut ? "text-racing-green" : "text-f1",
            )}
          >
            {formatSeconds(prediction.projectedGap, true)}
          </div>
        </div>
      </div>

      {/* Footnote */}
      <div className="mt-3 pt-2 border-t border-white/5">
        <p className="text-f1-muted text-[10px] font-mono leading-snug">
          {lapsRemaining} laps left · est. deg{" "}
          <span className="text-f1-sub">+{tireDegPerLap.toFixed(2)}s/lap</span>
        </p>
      </div>
    </div>
  );
}
