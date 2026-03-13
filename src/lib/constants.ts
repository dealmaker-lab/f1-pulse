/**
 * Shared constants for F1 Pulse
 */

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Full historical year range — Jolpica/Ergast data goes back to 1950.
 * Used for pages that only need results/standings data (H2H, Drivers, Constructors).
 */
export const HISTORICAL_YEARS = Array.from(
  { length: CURRENT_YEAR - 1950 + 1 },
  (_, i) => CURRENT_YEAR - i
);

/**
 * OpenF1 year range — OpenF1 has detailed telemetry/session data from 2023 onward.
 * Used for pages that depend on OpenF1 endpoints (Telemetry, Strategy, Weather, Radio, Race Replay).
 */
export const OPENF1_YEARS = Array.from(
  { length: CURRENT_YEAR - 2023 + 1 },
  (_, i) => CURRENT_YEAR - i
);

/**
 * Era labels for grouping classic years in select dropdowns
 */
export const ERA_LABELS: Record<string, [number, number]> = {
  "Modern Era": [2014, CURRENT_YEAR],
  "V8 Era": [2006, 2013],
  "V10 Era": [2000, 2005],
  "90s": [1990, 1999],
  "80s": [1980, 1989],
  "70s": [1970, 1979],
  "60s": [1960, 1969],
  "50s": [1950, 1959],
};

/**
 * Get the era label for a given year
 */
export function getEraForYear(year: number): string {
  for (const [era, [start, end]] of Object.entries(ERA_LABELS)) {
    if (year >= start && year <= end) return era;
  }
  return "Unknown";
}
