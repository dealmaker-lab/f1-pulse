/**
 * Fantasy F1 — domain helpers + 2026 default prices + scoring algorithm.
 *
 * Used by the /fantasy page (UI), /api/fantasy/lineup (CRUD), /api/fantasy/score
 * (admin scorer). The migration that creates the backing tables lives at
 * `supabase/migrations/20260429_fantasy_f1.sql` — apply with `npx supabase db push`.
 */

/** Hard cap on a lineup's combined driver+constructor cost, in $M. */
export const FANTASY_BUDGET_M = 100;

/** Number of drivers that must be picked. */
export const FANTASY_DRIVERS_COUNT = 5;

/** Number of constructors that must be picked. */
export const FANTASY_CONSTRUCTORS_COUNT = 1;

/**
 * Default 2026 driver prices (used when no row exists in `fantasy_prices`).
 * Tiered by recent form / pedigree:
 *   Tier S  (~$30M)  — clear #1 drivers / champions
 *   Tier A  (~$22M)  — front-runners
 *   Tier B  (~$15M)  — solid mid-pack veterans
 *   Tier C  (~$10M)  — rookies / mid-pack
 *   Tier D  (~$6M)   — backmarkers / reserve
 *
 * Codes are the 3-letter Jolpica/F1.com driver codes used elsewhere in the app.
 */
export const DEFAULT_2026_DRIVER_PRICES: Record<string, number> = {
  // Tier S
  VER: 30.0, // Verstappen
  NOR: 29.0, // Norris
  // Tier A
  PIA: 25.0, // Piastri
  LEC: 24.0, // Leclerc
  HAM: 23.0, // Hamilton
  RUS: 22.0, // Russell
  // Tier B
  ALO: 18.0, // Alonso
  SAI: 17.0, // Sainz
  ALB: 15.0, // Albon
  ANT: 15.0, // Antonelli
  GAS: 13.0, // Gasly
  HAD: 12.0, // Hadjar
  // Tier C
  TSU: 11.0, // Tsunoda
  HUL: 10.0, // Hulkenberg
  LAW: 10.0, // Lawson
  STR: 9.5,  // Stroll
  OCO: 9.0,  // Ocon
  BEA: 8.5,  // Bearman
  // Tier D
  COL: 7.0,  // Colapinto
  BOR: 6.5,  // Bortoleto
  DOO: 6.0,  // Doohan
};

/**
 * Default 2026 constructor prices (used when no row exists in `fantasy_prices`).
 * Keys match the canonical team names from `src/lib/team-logos.ts`.
 */
export const DEFAULT_2026_CONSTRUCTOR_PRICES: Record<string, number> = {
  "McLaren": 30.0,
  "Red Bull Racing": 28.0,
  "Ferrari": 26.0,
  "Mercedes": 24.0,
  "Aston Martin": 16.0,
  "Williams": 14.0,
  "Alpine": 11.0,
  "Racing Bulls": 11.0,
  "Haas F1 Team": 9.0,
  "Kick Sauber": 7.0,
};

/** Convenience union — every code that has a default price. */
export type DefaultDriverCode = keyof typeof DEFAULT_2026_DRIVER_PRICES;
export type DefaultConstructorName = keyof typeof DEFAULT_2026_CONSTRUCTOR_PRICES;

/** Look up a driver price; falls back to a mid-tier default for unknown codes. */
export function getDriverPrice(code: string, overrides?: Record<string, number>): number {
  if (overrides && code in overrides) return overrides[code];
  if (code in DEFAULT_2026_DRIVER_PRICES) {
    return DEFAULT_2026_DRIVER_PRICES[code as DefaultDriverCode];
  }
  return 8.0;
}

/** Look up a constructor price; falls back to a mid-tier default for unknown teams. */
export function getConstructorPrice(name: string, overrides?: Record<string, number>): number {
  if (overrides && name in overrides) return overrides[name];
  if (name in DEFAULT_2026_CONSTRUCTOR_PRICES) {
    return DEFAULT_2026_CONSTRUCTOR_PRICES[name as DefaultConstructorName];
  }
  return 10.0;
}

/** A single race result row used by the scoring algorithm. */
export interface FantasyResultRow {
  code: string;          // driver 3-letter code
  team: string;          // constructor name (matches lineup.constructor)
  position: number | null; // null if DNF / DNS / DSQ
  fastestLap: boolean;
  status: string;        // Jolpica status string ("Finished", "+1 Lap", "Engine", ...)
}

/**
 * Score a lineup against actual race results.
 *
 * Algorithm:
 *   For each picked driver:
 *     - DNF / null position → -5
 *     - else: base = max(0, 21 - position), capped at 25
 *     - +5 if fastest lap
 *     - +5 if podium (P1-P3)
 *     - +3 if outscored teammate (better finishing position)
 *   Constructor:
 *     - Sum of its drivers' driver-scores / 2 (across all drivers in the
 *       provided results — not just the ones in the lineup).
 *
 * The split lets a great driver carry a weak teammate without doubling the
 * win, while still rewarding picking the strongest team.
 */
export function scoreLineup(input: {
  drivers: string[];
  constructor: string;
  results: FantasyResultRow[];
}): number {
  const { drivers, constructor, results } = input;

  // Index by code for O(1) lookups.
  const byCode = new Map<string, FantasyResultRow>();
  for (const r of results) byCode.set(r.code, r);

  // Helper: per-driver score (used both for the lineup picks and the
  // constructor sum-of-its-drivers calculation).
  const driverScore = (row: FantasyResultRow | undefined): number => {
    if (!row) return 0;
    const dnf = row.position == null || isDnfStatus(row.status);
    if (dnf) return -5;

    const pos = row.position as number;
    let s = Math.min(25, Math.max(0, 21 - pos));
    if (row.fastestLap) s += 5;
    if (pos <= 3) s += 5;

    // Teammate comparison — find the other driver from the same team.
    const teammate = results.find(
      (r) => r.team === row.team && r.code !== row.code,
    );
    if (teammate && teammate.position != null && pos < teammate.position) {
      s += 3;
    }
    return s;
  };

  // Sum picked drivers.
  let total = 0;
  for (const code of drivers) {
    total += driverScore(byCode.get(code));
  }

  // Constructor score = sum of its drivers' driver-scores / 2.
  const teamRows = results.filter((r) => r.team === constructor);
  const constructorRaw = teamRows.reduce((s, r) => s + driverScore(r), 0);
  total += constructorRaw / 2;

  // Round to 2 dp to match the NUMERIC(8,2) column.
  return Math.round(total * 100) / 100;
}

/** Statuses that indicate the driver did not finish — they score -5. */
function isDnfStatus(status: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  if (s === "finished") return false;
  if (s.startsWith("+")) return false; // "+1 Lap", "+2 Laps" — still classified
  // Common DNF reasons in Jolpica: Engine, Accident, Collision, Gearbox,
  // Hydraulics, Retired, Did not start, Disqualified, etc.
  return true;
}
