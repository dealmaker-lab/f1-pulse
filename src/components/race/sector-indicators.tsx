"use client";

import { cn } from "@/lib/utils";

/**
 * F1 broadcast-style sector color coding for a single driver's most recent
 * lap. The four states mirror what you see on the world feed timing tower:
 *
 *  - Purple  : overall fastest sector across the entire session
 *  - Green   : driver's personal best for that sector this session
 *  - Yellow  : improvement on the prior lap but still slower than the
 *              driver's personal best (kept for completeness — the world
 *              feed rarely surfaces this state)
 *  - Gray    : neither (or no data yet)
 */
export interface SectorIndicatorsProps {
  /** One entry per sector — exactly three (1, 2, 3) is expected, but the
   *  component tolerates fewer and renders a gray placeholder for missing
   *  sectors so it never collapses the leaderboard row. */
  sectors: Array<{
    sector: 1 | 2 | 3;
    durationSec: number | null;
    isOverallBest: boolean;
    isPersonalBest: boolean;
    isImprovement: boolean;
  }>;
  /** Compact (race-page leaderboard) renders 8x8 dots; full renders 28x18
   *  pixel boxes with the time inscribed. Default: compact. */
  variant?: "compact" | "full";
  className?: string;
}

// Broadcast-feed canonical hex values. We hard-code these instead of using
// Tailwind so the component is portable inside high-density tables where
// arbitrary classes get stripped by purge in some build configurations.
const SECTOR_COLORS = {
  overall: "#A855F7", // purple-500
  personal: "#22C55E", // green-500
  improvement: "#FACC15", // yellow-400
  neutral: "rgba(255,255,255,0.12)",
} as const;

function classifyColor(s: SectorIndicatorsProps["sectors"][number]): string {
  if (s.durationSec == null) return SECTOR_COLORS.neutral;
  if (s.isOverallBest) return SECTOR_COLORS.overall;
  if (s.isPersonalBest) return SECTOR_COLORS.personal;
  if (s.isImprovement) return SECTOR_COLORS.improvement;
  return SECTOR_COLORS.neutral;
}

function classifyLabel(s: SectorIndicatorsProps["sectors"][number]): string {
  if (s.durationSec == null) return "No time";
  if (s.isOverallBest) return "Overall fastest";
  if (s.isPersonalBest) return "Personal best";
  if (s.isImprovement) return "Improvement";
  return "Slower";
}

/** Format sector duration as `SS.sss` (broadcast convention — sectors are
 *  always sub-minute, so we elide the leading `0:`). */
function formatSector(durationSec: number | null): string {
  if (durationSec == null) return "--.---";
  return durationSec.toFixed(3);
}

export default function SectorIndicators({
  sectors,
  variant = "compact",
  className,
}: SectorIndicatorsProps) {
  // Always render in 1→2→3 order regardless of input ordering.
  const ordered: Array<SectorIndicatorsProps["sectors"][number]> = [1, 2, 3].map(
    (n) =>
      sectors.find((s) => s.sector === n) ?? {
        sector: n as 1 | 2 | 3,
        durationSec: null,
        isOverallBest: false,
        isPersonalBest: false,
        isImprovement: false,
      },
  );

  if (variant === "full") {
    return (
      <div
        className={cn("flex items-center gap-1", className)}
        role="group"
        aria-label="Sector times"
      >
        {ordered.map((s) => {
          const color = classifyColor(s);
          const label = classifyLabel(s);
          const isActive = s.durationSec != null && color !== SECTOR_COLORS.neutral;
          return (
            <div
              key={s.sector}
              title={`Sector ${s.sector}: ${formatSector(s.durationSec)} (${label})`}
              className="flex items-center justify-center rounded-ferrari font-mono"
              style={{
                width: 28,
                height: 18,
                fontSize: 10,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                backgroundColor: isActive ? `${color}26` : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? color : "rgba(255,255,255,0.08)"}`,
                color: isActive ? color : "var(--f1-muted, #8F8F8F)",
              }}
            >
              {formatSector(s.durationSec)}
            </div>
          );
        })}
      </div>
    );
  }

  // Compact — three 8x8 squares.
  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label="Sector status"
    >
      {ordered.map((s) => {
        const color = classifyColor(s);
        const label = classifyLabel(s);
        return (
          <span
            key={s.sector}
            title={`Sector ${s.sector}: ${formatSector(s.durationSec)} (${label})`}
            className="rounded-ferrari"
            style={{
              width: 8,
              height: 8,
              backgroundColor: color,
              boxShadow:
                color === SECTOR_COLORS.neutral
                  ? "inset 0 0 0 1px rgba(255,255,255,0.06)"
                  : `0 0 6px ${color}55`,
            }}
            aria-label={`Sector ${s.sector}: ${label}`}
          />
        );
      })}
    </div>
  );
}

/**
 * Given OpenF1 lap data, classify each sector for a single driver's most
 * recent lap against session-wide bests.
 *
 * Best-sector logic:
 *  - overall best : shortest duration across all drivers and laps
 *  - personal best: shortest duration for THIS driver across their laps
 *  - improvement  : faster than this driver's prior lap, but slower than
 *                   their personal best
 *
 * Laps with null/zero/negative sector durations are ignored when computing
 * bests so an in-progress lap doesn't poison the comparison.
 */
export function computeSectorColors(
  laps: Array<{
    driver_number: number;
    duration_sector_1: number | null;
    duration_sector_2: number | null;
    duration_sector_3: number | null;
    lap_number: number;
  }>,
  targetDriver: number,
): SectorIndicatorsProps["sectors"] {
  const sectorKeys = [
    "duration_sector_1",
    "duration_sector_2",
    "duration_sector_3",
  ] as const;

  // Helper: treat 0/negative/null as missing.
  const valid = (v: number | null | undefined): v is number =>
    typeof v === "number" && isFinite(v) && v > 0;

  // Overall bests across the entire session.
  const overallBest: Array<number | null> = sectorKeys.map((k) => {
    let best: number | null = null;
    for (const lap of laps) {
      const v = lap[k];
      if (valid(v) && (best == null || v < best)) best = v;
    }
    return best;
  });

  // Driver-specific laps in chronological order so we can detect
  // improvement vs the prior lap.
  const driverLaps = laps
    .filter((l) => l.driver_number === targetDriver)
    .sort((a, b) => a.lap_number - b.lap_number);

  // Personal bests for the target driver.
  const personalBest: Array<number | null> = sectorKeys.map((k) => {
    let best: number | null = null;
    for (const lap of driverLaps) {
      const v = lap[k];
      if (valid(v) && (best == null || v < best)) best = v;
    }
    return best;
  });

  // Latest and previous laps (for "improvement" detection).
  const latest = driverLaps[driverLaps.length - 1];
  const previous = driverLaps[driverLaps.length - 2];

  return sectorKeys.map((k, idx) => {
    const sector = (idx + 1) as 1 | 2 | 3;
    const dur = latest && valid(latest[k]) ? (latest[k] as number) : null;
    const ob = overallBest[idx];
    const pb = personalBest[idx];
    const prev = previous && valid(previous[k]) ? (previous[k] as number) : null;

    const isOverallBest = dur != null && ob != null && dur === ob;
    const isPersonalBest = dur != null && pb != null && dur === pb && !isOverallBest;
    const isImprovement =
      dur != null &&
      prev != null &&
      dur < prev &&
      !isPersonalBest &&
      !isOverallBest;

    return {
      sector,
      durationSec: dur,
      isOverallBest,
      isPersonalBest,
      isImprovement,
    };
  });
}
