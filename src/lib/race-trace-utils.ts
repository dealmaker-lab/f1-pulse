/**
 * Pure utility functions for building race-trace and lap-position
 * timeseries from raw OpenF1 lap/position data.
 *
 * Kept dependency-free so they are trivially unit-testable.
 *
 * NOTE: tsconfig target is es5 — Map/Set iteration uses `Array.from(...)`
 * rather than `for...of` to avoid the downlevel-iteration restriction.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface RawLap {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  is_pit_out_lap?: boolean;
  date_start?: string;
}

export interface RawPosition {
  driver_number: number;
  position: number;
  date: string;
}

export interface RaceTracePoint {
  lap: number;
  gapToLeader: number;
  pitLap: boolean;
}

export interface PositionPoint {
  lap: number;
  position: number;
}

// ───────────────────────────────────────────────────────────────────────────
// buildRaceTrace
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build per-driver gap-to-leader timeseries from raw lap timing data.
 *
 * Algorithm:
 *  1. Group laps by driver and order by lap_number.
 *  2. Skip laps with null/zero/negative lap_duration (out laps, deleted laps).
 *  3. Compute each driver's cumulative race time at every lap they completed.
 *  4. For each lap L, the leader's cumulative time is the min across all
 *     drivers that have a cumulative value at L.
 *  5. gapToLeader[d][L] = cumulative[d][L] - leader[L].
 *  6. Mark pitLap=true if a lap's duration is > 1.5x the driver's median lap
 *     duration (rough heuristic for in/out laps and slow pit laps). The
 *     `is_pit_out_lap` flag, when present, also forces pitLap=true.
 *
 * Returns Record<driverNumber, RaceTracePoint[]>, each array sorted by lap.
 */
export function buildRaceTrace(
  laps: Array<{
    driver_number: number;
    lap_number: number;
    lap_duration: number | null;
    is_pit_out_lap?: boolean;
  }>,
): Record<number, Array<{ lap: number; gapToLeader: number; pitLap: boolean }>> {
  type LapRow = { lap: number; duration: number; isPitOut: boolean };

  // Group laps by driver, retaining only rows with a usable duration.
  const byDriver: Record<number, LapRow[]> = {};

  for (const row of laps) {
    if (
      row.lap_duration === null ||
      row.lap_duration === undefined ||
      !Number.isFinite(row.lap_duration) ||
      row.lap_duration <= 0
    ) {
      continue;
    }
    const list = byDriver[row.driver_number] ?? [];
    list.push({
      lap: row.lap_number,
      duration: row.lap_duration,
      isPitOut: row.is_pit_out_lap === true,
    });
    byDriver[row.driver_number] = list;
  }

  // Sort each driver's laps and dedupe by lap_number (last write wins).
  const driverNumbers = Object.keys(byDriver).map((k) => Number(k));
  for (const driver of driverNumbers) {
    const list = byDriver[driver];
    list.sort((a, b) => a.lap - b.lap);
    const seen: Record<number, LapRow> = {};
    for (const r of list) seen[r.lap] = r;
    byDriver[driver] = Object.values(seen).sort((a, b) => a.lap - b.lap);
  }

  // Compute median lap duration per driver for the pit-lap heuristic.
  const medianByDriver: Record<number, number> = {};
  for (const driver of driverNumbers) {
    const list = byDriver[driver];
    if (list.length === 0) continue;
    const sorted = list.map((r) => r.duration).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianByDriver[driver] =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  // Build cumulative time per driver per lap.
  // cumulative[driver] = Record<lap, cumulativeSeconds>
  const cumulative: Record<number, Record<number, number>> = {};
  for (const driver of driverNumbers) {
    const cum: Record<number, number> = {};
    let total = 0;
    for (const r of byDriver[driver]) {
      total += r.duration;
      cum[r.lap] = total;
    }
    cumulative[driver] = cum;
  }

  // Determine the leader's cumulative time at each lap (min across drivers).
  const allLapsSet: Record<number, true> = {};
  for (const driver of driverNumbers) {
    for (const lapKey of Object.keys(cumulative[driver])) {
      allLapsSet[Number(lapKey)] = true;
    }
  }
  const leaderTimeByLap: Record<number, number> = {};
  for (const lapKey of Object.keys(allLapsSet)) {
    const lap = Number(lapKey);
    let best = Infinity;
    for (const driver of driverNumbers) {
      const v = cumulative[driver][lap];
      if (v !== undefined && v < best) best = v;
    }
    if (best !== Infinity) leaderTimeByLap[lap] = best;
  }

  // Assemble the output.
  const result: Record<number, RaceTracePoint[]> = {};
  for (const driver of driverNumbers) {
    const median = medianByDriver[driver] ?? 0;
    const cum = cumulative[driver];
    const driverLaps = byDriver[driver];
    const durationByLap: Record<number, { duration: number; isPitOut: boolean }> = {};
    for (const r of driverLaps) {
      durationByLap[r.lap] = { duration: r.duration, isPitOut: r.isPitOut };
    }

    const points: RaceTracePoint[] = [];
    const sortedLaps = Object.keys(cum)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    for (const lap of sortedLaps) {
      const leader = leaderTimeByLap[lap];
      if (leader === undefined) continue;
      const gap = cum[lap] - leader;
      const meta = durationByLap[lap];
      const pitLap =
        meta?.isPitOut === true ||
        (median > 0 && meta !== undefined && meta.duration > median * 1.5);
      points.push({ lap, gapToLeader: gap, pitLap });
    }
    result[driver] = points;
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// buildLapPositions
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build per-driver position-by-lap series from OpenF1 /position events.
 *
 * /position is event-based — one row per position change. We forward-fill so
 * that at lap L, each driver's position equals their last known position at
 * or before the lap's start time.
 *
 * Algorithm:
 *  1. Sort positions by date ascending.
 *  2. From the laps array, build a per-lap start-time map. Use the EARLIEST
 *     date_start across drivers as a proxy for the lap's wall-clock start
 *     (any driver finishing lap L means L+1 has begun).
 *  3. For each lap L from 1..maxLap, walk every driver's events with a
 *     moving cursor — taking the most recent position event with
 *     date <= lapStart[L]. If no event yet, skip.
 *  4. Return Record<driverNumber, PositionPoint[]>, arrays sorted by lap.
 */
export function buildLapPositions(
  positions: Array<{ driver_number: number; position: number; date: string }>,
  laps: Array<{ driver_number: number; lap_number: number; date_start: string }>,
): Record<number, Array<{ lap: number; position: number }>> {
  if (positions.length === 0 || laps.length === 0) return {};

  // 1. Sort positions by date ascending (defensive — input may be unordered).
  const sortedPositions = positions
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 2. Build lap → start time map. Use the EARLIEST date_start across drivers
  //    for each lap_number.
  const lapStartByLap: Record<number, number> = {};
  for (const lap of laps) {
    if (!lap.date_start) continue;
    const t = new Date(lap.date_start).getTime();
    if (!Number.isFinite(t)) continue;
    const existing = lapStartByLap[lap.lap_number];
    if (existing === undefined || t < existing) {
      lapStartByLap[lap.lap_number] = t;
    }
  }
  const sortedLapNumbers = Object.keys(lapStartByLap)
    .map((k) => Number(k))
    .sort((a, b) => a - b);
  if (sortedLapNumbers.length === 0) return {};

  // 3. Group position events by driver, preserving sort order.
  const eventsByDriver: Record<number, Array<{ time: number; position: number }>> = {};
  for (const p of sortedPositions) {
    const t = new Date(p.date).getTime();
    if (!Number.isFinite(t)) continue;
    const list = eventsByDriver[p.driver_number] ?? [];
    list.push({ time: t, position: p.position });
    eventsByDriver[p.driver_number] = list;
  }

  // 4. For each driver, walk laps in order using a moving cursor through
  //    their position events (O(laps + events) per driver instead of O(L*E)).
  const result: Record<number, PositionPoint[]> = {};
  const driverNumbers = Object.keys(eventsByDriver).map((k) => Number(k));
  for (const driver of driverNumbers) {
    const events = eventsByDriver[driver];
    const points: PositionPoint[] = [];
    let cursor = 0;
    let current: number | null = null;

    for (const lap of sortedLapNumbers) {
      const lapStart = lapStartByLap[lap];
      // Advance cursor through every event at or before lapStart.
      while (cursor < events.length && events[cursor].time <= lapStart) {
        current = events[cursor].position;
        cursor++;
      }
      if (current !== null) {
        points.push({ lap, position: current });
      }
    }
    result[driver] = points;
  }

  return result;
}
