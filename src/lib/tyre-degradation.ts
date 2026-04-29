/**
 * Tyre degradation analysis utilities.
 *
 * Pure functions, no React. Used by the TyreDegradationChart component
 * and any chat-tool that wants to reason about stint pace decay.
 *
 * Modeling notes
 * --------------
 * Modern F1 cars start the race carrying ~110 kg of fuel (the regulation
 * maximum) and burn it linearly to ~0 kg by the chequered flag. Each
 * additional kilogram of fuel costs roughly 0.03 s/lap (a widely-used
 * FastF1 / Pirelli heuristic). So the "fuel effect" depends on how many
 * laps remain in the race, not just the lap number itself — a 30-lap race
 * burns the same fuel mass as a 70-lap race, just faster per lap.
 *
 * To isolate tyre degradation from this fuel-burn pace gain we subtract
 * an estimated fuel-correction term from each raw lap time. The resulting
 * "corrected" lap time should slope upward as the rubber wears, with the
 * fuel effect taken out.
 */

/**
 * Compute fuel-corrected lap time for a single lap.
 *
 * Heuristic: total race fuel ~110 kg consumed evenly over `totalRaceLaps`
 * laps. Per-kg pace effect ~0.03 s/lap. Therefore each lap of the race
 * burns `110 / totalRaceLaps` kg, removing `(110 / totalRaceLaps) * 0.03`
 * seconds of pace penalty per lap.
 *
 * The first lap of the race (raceLap = 1) carries the maximum fuel
 * penalty; the last lap carries effectively zero fuel penalty. The
 * correction we subtract from a given lap is therefore proportional to
 * the laps still remaining (including the current one).
 *
 * @param lapTime raw lap time in seconds
 * @param raceLap current lap number (1-indexed within the race)
 * @param totalRaceLaps total scheduled race laps
 * @returns lap time normalised to a (theoretical) zero-fuel baseline
 */
export function fuelCorrectLap(
  lapTime: number,
  raceLap: number,
  totalRaceLaps: number,
): number {
  if (!Number.isFinite(lapTime) || lapTime <= 0) return lapTime;
  if (!Number.isFinite(totalRaceLaps) || totalRaceLaps <= 0) return lapTime;

  const TOTAL_FUEL_KG = 110;
  const SEC_PER_KG = 0.03;
  const fuelEffectPerLap = (TOTAL_FUEL_KG / totalRaceLaps) * SEC_PER_KG;

  const lapClamped = Math.max(1, Math.min(raceLap, totalRaceLaps));
  // Laps still ahead (including the current one). Lap 1 → totalRaceLaps,
  // last lap → 1. Multiply by fuelEffectPerLap to get the seconds of
  // pace currently being absorbed by carrying fuel.
  const lapsAhead = totalRaceLaps - lapClamped + 1;
  const fuelPenalty = lapsAhead * fuelEffectPerLap;

  return lapTime - fuelPenalty;
}

/**
 * Build a degradation curve for one stint.
 *
 * Filters out:
 *   - laps with null / 0 / non-finite duration
 *   - the pit-out lap (first lap of the stint), which is artificially slow
 *   - the pit-in lap (last lap of the stint), which is artificially slow
 *
 * `tireAge` is 0-indexed (the first kept lap of the stint = age 0). This
 * is the number of laps the tyre has *already* been used at the start of
 * the lap, which is the convention most strategy graphs use.
 *
 * @param stintLaps laps belonging to a single stint, ordered by lap_number
 * @param raceLapStart race lap number where the stint begins
 * @param totalRaceLaps total scheduled race laps (for fuel correction)
 */
export function buildDegradationCurve(
  stintLaps: Array<{
    lap_number: number;
    lap_duration: number | null;
    is_pit_out_lap?: boolean;
  }>,
  raceLapStart: number,
  totalRaceLaps: number,
): Array<{
  tireAge: number;
  raceLap: number;
  rawLapTime: number;
  correctedLapTime: number;
  deltaFromStart: number;
}> {
  if (!stintLaps || stintLaps.length === 0) return [];

  // Sort defensively — callers may pass unsorted slices.
  const sorted = [...stintLaps].sort((a, b) => a.lap_number - b.lap_number);

  const lastLapNumber = sorted[sorted.length - 1]?.lap_number;

  // First pass: drop pit-out, pit-in, and unusable laps.
  const usable = sorted.filter((lap, idx) => {
    if (lap.lap_duration === null || lap.lap_duration === undefined) return false;
    if (!Number.isFinite(lap.lap_duration) || lap.lap_duration <= 0) return false;
    // Pit-out lap (first of stint) — either flagged explicitly or
    // implicitly the first lap of the input.
    if (lap.is_pit_out_lap) return false;
    if (idx === 0) return false;
    // Pit-in lap (last of stint) — only if there's more than one lap.
    if (sorted.length > 1 && lap.lap_number === lastLapNumber) return false;
    return true;
  });

  if (usable.length === 0) return [];

  // Compute the corrected baseline from the first usable lap.
  const baselineCorrected = fuelCorrectLap(
    usable[0].lap_duration as number,
    raceLapStart + (usable[0].lap_number - sorted[0].lap_number),
    totalRaceLaps,
  );

  return usable.map((lap, idx) => {
    const rawLapTime = lap.lap_duration as number;
    // Race lap of this lap. We trust lap.lap_number when it makes sense,
    // but fall back to the offset-from-stint-start if the data is sparse.
    const raceLap =
      Number.isFinite(lap.lap_number) && lap.lap_number > 0
        ? lap.lap_number
        : raceLapStart + idx;
    const correctedLapTime = fuelCorrectLap(rawLapTime, raceLap, totalRaceLaps);
    return {
      tireAge: idx, // 0 = first usable lap of stint
      raceLap,
      rawLapTime,
      correctedLapTime,
      deltaFromStart: correctedLapTime - baselineCorrected,
    };
  });
}

/**
 * Linear regression of corrected lap time against tyre age.
 *
 * Returns slope (s/lap of degradation), intercept, and r² goodness of
 * fit. A positive slope is the expected case (tyres slow down as they
 * age). A small or negative slope can mean the driver was managing
 * tyres, the track was rubbering in, or the stint is too short to draw
 * a conclusion — the r² value tells you how much to trust the slope.
 *
 * Returns slope = 0, rSquared = 0 for fewer than 2 valid data points.
 */
export function fitDegradationSlope(
  curve: Array<{ tireAge: number; correctedLapTime: number }>,
): { slope: number; rSquared: number; intercept: number } {
  if (!curve || curve.length < 2) {
    return { slope: 0, rSquared: 0, intercept: curve?.[0]?.correctedLapTime ?? 0 };
  }

  const n = curve.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of curve) {
    sumX += point.tireAge;
    sumY += point.correctedLapTime;
    sumXY += point.tireAge * point.correctedLapTime;
    sumXX += point.tireAge * point.tireAge;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;
  if (denom === 0) {
    return { slope: 0, rSquared: 0, intercept: meanY };
  }
  const slope = (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;

  // r² = 1 - SS_res / SS_tot
  let ssTot = 0;
  let ssRes = 0;
  for (const point of curve) {
    const predicted = intercept + slope * point.tireAge;
    ssTot += (point.correctedLapTime - meanY) ** 2;
    ssRes += (point.correctedLapTime - predicted) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, rSquared, intercept };
}
