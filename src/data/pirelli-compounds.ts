/**
 * Pirelli compound allocations for the 2026 F1 season.
 *
 * Pirelli does not publish a JSON API for compound nominations; they release
 * race-week press kits as HTML/PDF. This file is a static, hand-curated
 * fallback so the UI can always show a sensible preview, even before the
 * official press release lands.
 *
 * Allocations below are best-effort estimates based on the published 2025
 * choices, which historically carry over with at most a single-step shift
 * for tracks where Pirelli wants more or less degradation. Once the 2026
 * official kit lands per race, swap the per-event entries in here. The
 * `source: "static"` flag in the API response makes the provenance clear
 * to the client.
 *
 * Compound numbering: C1 is the hardest, C5 is the softest (Pirelli dropped the C6 for 2026). For each event
 * Pirelli picks three adjacent compounds and assigns:
 *   - the hardest of the three  -> "Hard" (white)
 *   - the middle                -> "Medium" (yellow)
 *   - the softest               -> "Soft" (red)
 *
 * Pressures: front 23.5–26.5 psi, rear 21.0–25.0 psi typical. Numbers below
 * are reasonable defaults; per-event mandates fluctuate by a few tenths and
 * Pirelli only publishes them in the official Friday-evening tech bulletin.
 *
 * Stint estimates: optimal medium-compound stint length in laps. Numbers
 * below are race-engineer rules of thumb (verified against 2024/2025 race
 * data) — not a strategy simulation.
 */

import { resolveCircuitSlug } from "@/lib/circuit-coords";

export interface CompoundAllocation {
  /** Race round (1..22). */
  round: number;
  /** OpenF1 `circuit_short_name` — the canonical key used everywhere else in the app. */
  circuit: string;
  /** Compound nominations. C1=hardest, C5=softest. */
  hard: "C1" | "C2" | "C3";
  medium: "C2" | "C3" | "C4" | "C5";
  soft: "C3" | "C4" | "C5";
  /** Min start pressure mandate (psi). Front/rear may differ by event. */
  minStartPressureFrontPsi?: number;
  minStartPressureRearPsi?: number;
  /** Estimated optimal stint length in laps for the medium compound. */
  estimatedMediumStintLaps?: number;
  /** Track abrasion rating — drives soft-compound viability. */
  abrasion: "low" | "medium" | "high";
}

/** Default pressures used when no event-specific mandate is known. */
const DEFAULT_FRONT_PSI = 24.0;
const DEFAULT_REAR_PSI = 22.5;

/**
 * Per-circuit allocations. Round numbers track the FIA-approved 2026
 * provisional calendar order. If the calendar shifts, only the `round`
 * field needs updating — UI lookup is by `circuit` (string-keyed).
 */
export const PIRELLI_2026_ALLOCATIONS: CompoundAllocation[] = [
  {
    round: 1,
    circuit: "albert-park",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.0,
    estimatedMediumStintLaps: 20,
    abrasion: "medium",
  },
  {
    round: 2,
    circuit: "shanghai",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 19,
    abrasion: "medium",
  },
  {
    round: 3,
    circuit: "suzuka",
    hard: "C1",
    medium: "C2",
    soft: "C3",
    minStartPressureFrontPsi: 24.5,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 17,
    abrasion: "high",
  },
  {
    round: 4,
    circuit: "miami",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.0,
    estimatedMediumStintLaps: 21,
    abrasion: "medium",
  },
  {
    round: 5,
    circuit: "montreal",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.0,
    estimatedMediumStintLaps: 23,
    abrasion: "low",
  },
  {
    round: 6,
    circuit: "monte-carlo",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 23.5,
    minStartPressureRearPsi: 21.0,
    estimatedMediumStintLaps: 30,
    abrasion: "low",
  },
  {
    round: 7,
    circuit: "barcelona",
    hard: "C1",
    medium: "C2",
    soft: "C3",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 18,
    abrasion: "high",
  },
  {
    round: 8,
    circuit: "red-bull-ring",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 20,
    abrasion: "medium",
  },
  {
    round: 9,
    circuit: "silverstone",
    hard: "C1",
    medium: "C2",
    soft: "C3",
    minStartPressureFrontPsi: 25.5,
    minStartPressureRearPsi: 23.5,
    estimatedMediumStintLaps: 17,
    abrasion: "high",
  },
  {
    round: 10,
    circuit: "spa-francorchamps",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 25.0,
    minStartPressureRearPsi: 23.0,
    estimatedMediumStintLaps: 18,
    abrasion: "medium",
  },
  {
    round: 11,
    circuit: "hungaroring",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 24,
    abrasion: "medium",
  },
  {
    round: 12,
    circuit: "zandvoort",
    hard: "C1",
    medium: "C2",
    soft: "C3",
    minStartPressureFrontPsi: 24.5,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 20,
    abrasion: "medium",
  },
  {
    round: 13,
    circuit: "monza",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 25.0,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 22,
    abrasion: "low",
  },
  {
    round: 14,
    circuit: "madrid",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.0,
    estimatedMediumStintLaps: 22,
    abrasion: "low",
  },
  {
    round: 15,
    circuit: "baku",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 23.5,
    minStartPressureRearPsi: 21.5,
    estimatedMediumStintLaps: 25,
    abrasion: "low",
  },
  {
    round: 16,
    circuit: "marina-bay",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.0,
    estimatedMediumStintLaps: 23,
    abrasion: "medium",
  },
  {
    round: 17,
    circuit: "circuit-of-the-americas",
    hard: "C1",
    medium: "C2",
    soft: "C3",
    minStartPressureFrontPsi: 24.5,
    minStartPressureRearPsi: 22.5,
    estimatedMediumStintLaps: 18,
    abrasion: "high",
  },
  {
    round: 18,
    circuit: "mexico-city",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 23.5,
    minStartPressureRearPsi: 21.5,
    estimatedMediumStintLaps: 22,
    abrasion: "medium",
  },
  {
    round: 19,
    circuit: "interlagos",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.0,
    estimatedMediumStintLaps: 20,
    abrasion: "medium",
  },
  {
    round: 20,
    circuit: "las-vegas",
    hard: "C3",
    medium: "C4",
    soft: "C5",
    minStartPressureFrontPsi: 23.5,
    minStartPressureRearPsi: 21.5,
    estimatedMediumStintLaps: 24,
    abrasion: "low",
  },
  {
    round: 21,
    circuit: "losail",
    hard: "C1",
    medium: "C2",
    soft: "C3",
    minStartPressureFrontPsi: 25.0,
    minStartPressureRearPsi: 23.0,
    estimatedMediumStintLaps: 17,
    abrasion: "high",
  },
  {
    round: 22,
    circuit: "yas-marina",
    hard: "C2",
    medium: "C3",
    soft: "C4",
    minStartPressureFrontPsi: 24.0,
    minStartPressureRearPsi: 22.0,
    estimatedMediumStintLaps: 21,
    abrasion: "low",
  },
];

/**
 * Build a lookup map once at module load. Lookups happen on every
 * `/api/pirelli/preview` call and on every dashboard render — repeated
 * `Array.find` is fine at 22 entries but a Map makes intent clearer.
 */
const ALLOCATION_BY_CIRCUIT: ReadonlyMap<string, CompoundAllocation> = new Map(
  PIRELLI_2026_ALLOCATIONS.map((a) => [a.circuit.toLowerCase(), a]),
);

/**
 * Resolve the allocation for a given OpenF1 circuit short name. Case-insensitive.
 * Returns `null` when the circuit isn't on the 2026 calendar (e.g. an old race
 * still showing up in historical-year data, or a typo).
 */
export function getCompoundAllocation(
  circuitShortName: string,
): CompoundAllocation | null {
  if (!circuitShortName) return null;
  // OpenF1 uses names like "Spielberg"/"Yas Marina Circuit"; our table keys
  // are canonical slugs — resolve through the shared alias map so roughly
  // half the calendar doesn't silently return null.
  const allocation = ALLOCATION_BY_CIRCUIT.get(
    resolveCircuitSlug(circuitShortName),
  );
  if (!allocation) return null;

  // Fill in default pressures if a per-event mandate wasn't specified.
  // Done at read time (not at module load) so the static array stays a
  // pure data declaration without spread-induced clutter.
  return {
    ...allocation,
    minStartPressureFrontPsi:
      allocation.minStartPressureFrontPsi ?? DEFAULT_FRONT_PSI,
    minStartPressureRearPsi:
      allocation.minStartPressureRearPsi ?? DEFAULT_REAR_PSI,
  };
}
