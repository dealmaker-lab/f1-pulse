"use client";

import { cn } from "@/lib/utils";

/**
 * 2026 Active Aero + Override badge.
 *
 * 2026 F1 regs swap DRS for two-state active aero (Z = high-downforce default,
 * X = low-drag straight-line mode) plus a per-lap "Override" battery budget
 * the driver can spend to add power when within 1.0s of the car ahead.
 *
 * OpenF1's exact 2026 telemetry schema isn't published yet, so every field
 * here is optional. Renders nothing if all fields are null/undefined.
 *
 * Render rules (priority top-to-bottom in compact mode):
 *   1. overrideActive  → amber pulsing OVR chip (most important — driver is attacking)
 *   2. aeroMode === "X" → low-drag pill, racing-green styling
 *   3. aeroMode === "Z" → neutral white/40 chip
 *   4. budgetRemaining → thin progress bar underneath (amber → red as it depletes)
 *
 * Compact mode: hide labels, show only colored dot/icon variants — used inside
 * tight telemetry cards where the full "X-MODE" pill would wrap or truncate.
 */

export interface AeroOverrideBadgeProps {
  aeroMode?: "Z" | "X" | null;
  overrideActive?: boolean | null;
  /** 0..1 — fraction of the per-lap override energy budget still available. */
  budgetRemaining?: number | null;
  compact?: boolean;
}

export function AeroOverrideBadge({
  aeroMode,
  overrideActive,
  budgetRemaining,
  compact = false,
}: AeroOverrideBadgeProps) {
  const hasAero = aeroMode === "Z" || aeroMode === "X";
  const hasOverride = overrideActive === true;
  const hasBudget =
    typeof budgetRemaining === "number" &&
    Number.isFinite(budgetRemaining) &&
    budgetRemaining >= 0 &&
    budgetRemaining <= 1;

  // Nothing to render — let the parent decide what placeholder (if any) to show.
  if (!hasAero && !hasOverride && !hasBudget) return null;

  // Budget bar color: amber when comfortable (>33%), red as it depletes.
  // Threshold tuned so a driver burning their entire allotment in one push
  // visually reads as "danger" before they fully run out.
  const budgetPct = hasBudget ? Math.max(0, Math.min(1, budgetRemaining)) * 100 : 0;
  const budgetColor = budgetPct > 33 ? "#ffc906" : "#e10600";

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center gap-1">
        {hasOverride && (
          <span
            className={cn(
              "font-mono font-bold rounded animate-pulse",
              "bg-racing-amber/30 text-racing-amber border border-racing-amber/40",
              compact ? "text-[7px] px-1 py-0" : "text-[8px] px-1.5 py-0.5",
            )}
            title="Override active — power boost engaged"
          >
            {compact ? "O" : "OVR"}
          </span>
        )}
        {aeroMode === "X" && (
          <span
            className={cn(
              "font-mono font-bold rounded border",
              "text-racing-green/80 bg-racing-green/15 border-racing-green/30",
              compact ? "text-[7px] px-1 py-0" : "text-[8px] px-1.5 py-0.5",
            )}
            title="X-mode — low drag (straight-line)"
          >
            {compact ? "X" : "X-MODE"}
          </span>
        )}
        {aeroMode === "Z" && (
          <span
            className={cn(
              "font-mono font-bold rounded border",
              "text-white/40 bg-white/5 border-white/10",
              compact ? "text-[7px] px-1 py-0" : "text-[8px] px-1.5 py-0.5",
            )}
            title="Z-mode — high downforce (default)"
          >
            {compact ? "Z" : "Z-MODE"}
          </span>
        )}
      </div>
      {hasBudget && (
        <div
          className="w-6 h-1 rounded-full bg-white/5 overflow-hidden"
          title={`Override budget: ${Math.round(budgetPct)}%`}
          aria-label={`Override budget remaining ${Math.round(budgetPct)} percent`}
        >
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${budgetPct}%`, backgroundColor: budgetColor }}
          />
        </div>
      )}
    </div>
  );
}

export default AeroOverrideBadge;
