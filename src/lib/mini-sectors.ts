/**
 * Mini-sector helpers for the circuit-map heatmap overlay.
 *
 * F1 broadcasts subdivide each lap into many "mini-sectors" (typically 24-30)
 * to highlight where each car gains/loses time. OpenF1 does NOT expose
 * mini-sector splits directly — only the three main `duration_sector_{1,2,3}`
 * fields per lap. To approximate per-mini-sector best times we distribute the
 * three known main-sector durations proportionally across N mini-sectors and
 * pick the fastest driver per slot.
 *
 * This is a deliberate approximation: it cannot detect intra-main-sector
 * differences (e.g. driver A is faster in turn 4 but slower in turn 6 of the
 * same main sector — both will be rendered the same color). For an MVP that
 * answers "who is overall quickest in this section of the lap?" it is
 * sufficient and runs in O(D × N) time per call.
 */

/**
 * Lap data needed to compute mini-sector bests. Each entry is the most recent
 * completed lap for one driver. Sectors that didn't complete (driver pitted,
 * crashed, in-out lap, etc.) come through as null and are skipped.
 */
export interface MiniSectorLap {
  driver_number: number;
  lap_number: number;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
}

/**
 * Output shape for the heatmap overlay. Matches the `MiniSectorBest`
 * interface exported from `circuit-map.tsx` so callers can pass results
 * straight through to the `<CircuitMap miniSectors={...} />` prop.
 */
export interface MiniSectorBest {
  /** 1-indexed mini-sector number (1..numMiniSectors). */
  sector: number;
  /** Driver number with the lowest approximated split, or null if no data. */
  fastestDriver: number | null;
  /** Approximated split time in seconds, or null if no data. */
  fastestTime: number | null;
}

/**
 * Distribute N mini-sectors across the 3 main sectors as evenly as possible,
 * front-loading any remainder onto the earlier sectors. With N=25 this
 * produces a [9, 8, 8] split; with N=24 it produces [8, 8, 8]; with N=27 it
 * produces [9, 9, 9]. The exact distribution is not important for the
 * heatmap — only that each main sector contributes a sensible fraction.
 */
function distributeMiniSectors(numMiniSectors: number): [number, number, number] {
  const base = Math.floor(numMiniSectors / 3);
  const remainder = numMiniSectors - base * 3;
  // remainder is always 0, 1, or 2 — front-load it onto sectors 1 and 2.
  return [
    base + (remainder >= 1 ? 1 : 0),
    base + (remainder >= 2 ? 1 : 0),
    base,
  ];
}

/**
 * Compute fastest-driver-per-mini-sector from raw OpenF1 lap data.
 *
 * Algorithm:
 *  1. Distribute the requested mini-sector count across the 3 main sectors.
 *  2. For each driver's most-recent lap, expand their 3 sector durations
 *     into a flat array of N approximated mini-sector times by dividing
 *     each main-sector time by the number of mini-sectors that fall inside it.
 *  3. For each mini-sector slot, pick the driver with the minimum time.
 *
 * Drivers whose most-recent lap has any null main-sector durations are
 * skipped entirely — we cannot fairly compare partial laps. Returns an
 * array of length `numMiniSectors`; slots with no candidate driver carry
 * `{ fastestDriver: null, fastestTime: null }`.
 *
 * @param laps        Most-recent lap per driver (one entry per driver max)
 * @param numMiniSectors  Number of mini-sectors to compute (default 25)
 */
export function computeMiniSectorBests(
  laps: MiniSectorLap[],
  numMiniSectors: number = 25,
): MiniSectorBest[] {
  const n = Math.max(1, Math.floor(numMiniSectors));
  const distribution = distributeMiniSectors(n);
  const [n1, n2] = distribution;

  // Pre-allocate the result with empty slots so callers always get N entries.
  const result: MiniSectorBest[] = [];
  for (let i = 0; i < n; i++) {
    result.push({ sector: i + 1, fastestDriver: null, fastestTime: null });
  }

  if (!laps.length) return result;

  // For each mini-sector slot, expand every driver's lap into an approximated
  // split, then pick the minimum.
  for (let slotIdx = 0; slotIdx < n; slotIdx++) {
    let bestDriver: number | null = null;
    let bestTime: number | null = null;

    for (const lap of laps) {
      if (
        lap.duration_sector_1 == null ||
        lap.duration_sector_2 == null ||
        lap.duration_sector_3 == null
      ) {
        continue; // skip partial laps
      }

      // Determine which main sector this slot falls into and how many slots
      // share that main sector. Approximated split = mainTime / slotsInThatSector.
      let approxTime: number;
      if (slotIdx < n1) {
        approxTime = lap.duration_sector_1 / n1;
      } else if (slotIdx < n1 + n2) {
        approxTime = lap.duration_sector_2 / n2;
      } else {
        approxTime = lap.duration_sector_3 / distribution[2];
      }

      if (bestTime == null || approxTime < bestTime) {
        bestTime = approxTime;
        bestDriver = lap.driver_number;
      }
    }

    result[slotIdx] = {
      sector: slotIdx + 1,
      fastestDriver: bestDriver,
      fastestTime: bestTime,
    };
  }

  return result;
}
