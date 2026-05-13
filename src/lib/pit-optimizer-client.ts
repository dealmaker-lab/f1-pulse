/**
 * Typed client for the pit-strategy optimizer Python sidecar at
 * `/api/fastf1/pit-optimize`.
 *
 * The sidecar runs a deterministic search over every viable
 * (n_stops, pit_laps, compound_assignment) combination and returns
 * the top 5 strategies ranked by estimated total race time.
 *
 * Cold start of the Python runtime + FastF1 archive lookup can be
 * 5–10 s on first hit. Consumers should display a loading hint.
 */

// ─── Public types ──────────────────────────────────────────────────────

export interface OptimizerStrategy {
  /** Number of pit stops in this strategy (1, 2, or 3) */
  stops: number;
  /** Lap numbers at which to pit, ascending */
  pitLaps: number[];
  /** Compounds per stint (length = stops + 1) */
  compounds: string[];
  /** Estimated total race time in seconds */
  estimatedTime: number;
  /** 1 = best, 5 = worst (within the top-5 returned) */
  rank: number;
}

export interface OptimizerResult {
  /** Driver code echoed back (e.g. "VER") */
  driver: string;
  /** Number of race laps for this driver */
  totalLaps: number;
  /** Top 5 strategies, sorted by estimatedTime ascending */
  strategies: OptimizerStrategy[];
  /** "Magical no-stop, fuel-only" reference race time, seconds */
  baseline: number;
  /** baseline - strategies[0].estimatedTime. Can be negative when
   *  even the best real strategy costs more than the fairy-tale ref. */
  saved: number;
  /** FastF1 event name, surfaced for debugging / display */
  event?: string;
  /** Pit-loss seconds used for this circuit */
  pitLoss?: number;
}

// ─── Raw response (Python snake_case mirror) ───────────────────────────

interface RawOptimizerResponse {
  driver: string;
  totalLaps: number;
  strategies: Array<{
    stops: number;
    pitLaps: number[];
    compounds: string[];
    estimatedTime: number;
    rank: number;
  }>;
  baseline: number;
  saved: number;
  event?: string;
  pitLoss?: number;
}

// ─── Errors ────────────────────────────────────────────────────────────

export class PitOptimizerError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "PitOptimizerError";
    this.status = status;
    this.details = details;
  }
}

// ─── Public API ────────────────────────────────────────────────────────

export interface FetchPitOptimizationInput {
  year: number;
  round: number;
  /** Race or Sprint only — qualifying-style sessions are rejected by the sidecar */
  session: "R" | "S";
  /** 3-letter driver code, e.g. "VER" */
  driver: string;
  /** Max stops to consider, 1..3. Default 2. */
  strategies?: number;
  signal?: AbortSignal;
}

/**
 * Fetch the optimal pit strategies for a given driver+session.
 *
 * Throws {@link PitOptimizerError} on validation failures, archive misses,
 * or upstream errors. The error's `status` mirrors the Python sidecar's
 * HTTP status (400, 404, 500, 504).
 */
export async function fetchPitOptimization(
  input: FetchPitOptimizationInput,
): Promise<OptimizerResult> {
  if (!input.driver || input.driver.length === 0) {
    throw new PitOptimizerError("driver code is required", 400);
  }
  if (input.session !== "R" && input.session !== "S") {
    throw new PitOptimizerError(
      "session must be R (Race) or S (Sprint)",
      400,
    );
  }
  const strategies = input.strategies ?? 2;
  if (strategies < 1 || strategies > 3) {
    throw new PitOptimizerError("strategies must be 1, 2, or 3", 400);
  }

  const params = new URLSearchParams({
    year: String(input.year),
    round: String(input.round),
    session: input.session,
    driver: input.driver.toUpperCase(),
    strategies: String(strategies),
  });

  let res: Response;
  try {
    res = await fetch(`/api/fastf1/pit-optimize?${params.toString()}`, {
      signal: input.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new PitOptimizerError(
      `Network error contacting optimizer: ${(err as Error).message}`,
      0,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PitOptimizerError(
      `Optimizer returned non-JSON response (status ${res.status})`,
      res.status,
    );
  }

  if (!res.ok) {
    const errMsg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new PitOptimizerError(errMsg, res.status, body);
  }

  const raw = body as RawOptimizerResponse;

  // Defensive: sidecar already sorts + caps but we re-sort by rank just
  // in case a future schema change introduces drift.
  const sorted = [...raw.strategies].sort((a, b) => a.rank - b.rank);

  return {
    driver: raw.driver,
    totalLaps: raw.totalLaps,
    strategies: sorted,
    baseline: raw.baseline,
    saved: raw.saved,
    event: raw.event,
    pitLoss: raw.pitLoss,
  };
}
