/**
 * Pit-window prediction utilities.
 *
 * Provides a static circuit → pit-loss table (seconds lost vs the leader
 * during a pit stop, including pit-lane entry/exit transit and the work
 * itself) and a small projection function for "if I pit now, where do I
 * come out?".
 *
 * Numbers are 2023–2025 averages from FastF1 + public team telemetry.
 * They are intentionally simple — strategy engineers run far more
 * sophisticated models — but are good enough for a UI prediction chip.
 */

const DEFAULT_PIT_LOSS = 22;

/**
 * Pit-loss per circuit, keyed by FastF1 / OpenF1 `circuit_short_name`
 * (lowercase, hyphenated). Values are seconds.
 */
export const PIT_LOSS_PER_CIRCUIT: Record<string, number> = {
  bahrain: 22,
  jeddah: 18,
  "albert-park": 22,
  suzuka: 22,
  shanghai: 22,
  miami: 22,
  imola: 23,
  "monte-carlo": 24,
  barcelona: 22,
  montreal: 21,
  "red-bull-ring": 21,
  silverstone: 22,
  hungaroring: 22,
  "spa-francorchamps": 19,
  zandvoort: 23,
  monza: 21,
  baku: 18,
  "marina-bay": 26,
  "circuit-of-the-americas": 22,
  "mexico-city": 23,
  interlagos: 22,
  "las-vegas": 19,
  losail: 23,
  "yas-marina": 21,
};

/**
 * Look up pit-loss for a circuit. Falls back to {@link DEFAULT_PIT_LOSS}
 * (22 s) for circuits that are not in the table — including legacy
 * venues, sprint circuits with weird formats, and typos.
 *
 * The lookup is case-insensitive and tolerant of underscores / spaces;
 * "Monte Carlo", "monte_carlo", and "monte-carlo" all match.
 */
export function getPitLoss(circuitShortName: string): number {
  if (!circuitShortName) return DEFAULT_PIT_LOSS;
  const normalised = circuitShortName
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-");
  const value = PIT_LOSS_PER_CIRCUIT[normalised];
  return typeof value === "number" ? value : DEFAULT_PIT_LOSS;
}

interface PitWindowInput {
  /** Current gap to the leader in seconds (positive = behind). */
  currentGapToLeader: number;
  /** Laps remaining in the race (>= 0). */
  lapsRemaining: number;
  /** Circuit short name for the pit-loss lookup. */
  circuitShortName: string;
  /**
   * Driver's tyre degradation on current rubber, in seconds/lap.
   * Default 0.05 — i.e. tyre is fading at ~50 ms/lap.
   */
  tireDegPerLap?: number;
  /**
   * Rival's degradation if they don't pit, in seconds/lap. Default 0
   * (assume rival is on fresh rubber; conservative for the pitting car).
   */
  rivalDegPerLap?: number;
}

interface PitWindowResult {
  pitLossSeconds: number;
  /** Gap to leader immediately after pitting (current + pit loss). */
  gapAfterPit: number;
  /** Projected gap at the chequered flag if both run their trajectories. */
  projectedGap: number;
  /** True if the projected gap is smaller than the current gap. */
  isUndercut: boolean;
  /** True if the current gap is already closing without a stop. */
  isOvercut: boolean;
}

/**
 * Project the gap to the leader after a hypothetical pit stop.
 *
 * The model is intentionally linear:
 *
 *   gapAfterPit  = currentGap + pitLoss
 *   projectedGap = gapAfterPit
 *                  + (rivalDegPerLap - 0)            * lapsRemaining   // rival on old tyres
 *                  - (0              - tireDegPerLap) * lapsRemaining  // we're on fresh tyres
 *
 * Simplified: each lap remaining, the pitting driver gains
 * `tireDegPerLap + rivalDegPerLap` seconds on the rival because the
 * rival is now the one losing pace per lap and we are not.
 *
 * `isUndercut` is true when projected gap is smaller than the current
 * gap — i.e. pitting now leaves us closer at the flag than not pitting.
 *
 * `isOvercut` is true when the *current* gap, run on old tyres, is
 * already closing on the rival faster than the pit-loss buys us back —
 * a cue to stay out longer before pitting.
 */
export function projectPitWindow(input: PitWindowInput): PitWindowResult {
  const {
    currentGapToLeader,
    lapsRemaining,
    circuitShortName,
    tireDegPerLap = 0.05,
    rivalDegPerLap = 0,
  } = input;

  const pitLossSeconds = getPitLoss(circuitShortName);
  const safeLapsRemaining = Math.max(0, Math.floor(lapsRemaining));

  const gapAfterPit = currentGapToLeader + pitLossSeconds;

  // Per-lap rate at which we close on the rival once we've pitted:
  // we shed our own degradation and pick up theirs.
  const closingRatePerLap = tireDegPerLap + rivalDegPerLap;
  const projectedGap = gapAfterPit - closingRatePerLap * safeLapsRemaining;

  const isUndercut = projectedGap < currentGapToLeader;

  // Overcut signal: staying out, our degradation is `tireDegPerLap`/lap
  // worse than theirs, but if their degradation is *higher* (e.g. they
  // just pitted onto a soft we don't want to be on), we may be closing.
  // The classic overcut: rivalDegPerLap > tireDegPerLap.
  const stayingOutClosingRate = rivalDegPerLap - tireDegPerLap;
  const projectedGapNoStop =
    currentGapToLeader - stayingOutClosingRate * safeLapsRemaining;
  const isOvercut = projectedGapNoStop < currentGapToLeader && !isUndercut;

  return {
    pitLossSeconds,
    gapAfterPit,
    projectedGap,
    isUndercut,
    isOvercut,
  };
}
