/**
 * Client for the FastF1 Python sidecar deployed at `/api/fastf1/*`.
 *
 * The Python functions (api/fastf1/telemetry.py, api/fastf1/laps.py) speak
 * plain JSON over HTTP. This module wraps the fetch + error handling so the
 * React side can consume strongly-typed data.
 *
 * Cold start of the Python runtime + FastF1 archive lookup can take 5–10s
 * on first hit. Components consuming this should display a "may take a
 * moment on first request" hint while loading.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export type SessionCode = "Q" | "R" | "FP1" | "FP2" | "FP3" | "SQ" | "S";

export interface TelemetrySample {
  /** Cumulative distance along the lap, metres */
  distance: number;
  /** km/h */
  speed: number;
  /** 0–100 */
  throttle: number;
  /** 0 or 1 */
  brake: number;
  /** Gear, 0–8 */
  gear: number;
  /** 0 or 1 (active) */
  drs: number;
}

export interface TelemetryDriver {
  code: string;
  team: string;
  /** Lap time in seconds */
  lapTime: number | null;
  compound: string;
  /** Lap number used for this driver (only set when lap !== "fastest") */
  lapNumber: number | null;
  telemetry: TelemetrySample[];
}

export interface TelemetryOverlayResponse {
  drivers: TelemetryDriver[];
  circuit: string;
  event: string;
  session: string;
  year: number;
  round: number;
  /** Number of evenly-spaced distance samples per driver */
  nSamples: number;
  /** Soft errors (e.g. one driver had no fastest lap), if any */
  warnings: string[] | null;
}

export interface FastF1LapRow {
  driver: string;
  driverNumber: number | null;
  team: string;
  lapNumber: number | null;
  /** Lap time in seconds */
  lapTime: number | null;
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  speedI1: number | null;
  speedI2: number | null;
  speedFL: number | null;
  speedST: number | null;
  compound: string;
  tyreLife: number | null;
  freshTyre: boolean | null;
  stint: number | null;
  position: number | null;
  isPitIn: boolean;
  isPitOut: boolean;
  pitInTime: number | null;
  pitOutTime: number | null;
  trackStatus: string | null;
  isPersonalBest: boolean | null;
  deleted: boolean | null;
}

export interface FastF1LapsResponse {
  year: number;
  round: number;
  event: string;
  circuit: string;
  session: string;
  drivers: Array<{
    code: string;
    team: string;
    number: number | null;
    fullName: string;
  }>;
  laps: FastF1LapRow[];
  nLaps: number;
}

// ─── Internal helpers ──────────────────────────────────────────────────

class FastF1Error extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "FastF1Error";
    this.status = status;
    this.details = details;
  }
}

interface RawTelemetryDriver {
  code: string;
  team: string;
  lap_time: number | null;
  compound: string;
  lap_number: number | null;
  telemetry: TelemetrySample[];
}

interface RawTelemetryResponse {
  drivers: RawTelemetryDriver[];
  circuit: string;
  event: string;
  session: string;
  year: number;
  round: number;
  n_samples: number;
  warnings: string[] | null;
}

interface RawLapRow {
  driver: string;
  driver_number: number | null;
  team: string;
  lap_number: number | null;
  lap_time: number | null;
  sector_1: number | null;
  sector_2: number | null;
  sector_3: number | null;
  speed_i1: number | null;
  speed_i2: number | null;
  speed_fl: number | null;
  speed_st: number | null;
  compound: string;
  tyre_life: number | null;
  fresh_tyre: boolean | null;
  stint: number | null;
  position: number | null;
  is_pit_in: boolean;
  is_pit_out: boolean;
  pit_in_time: number | null;
  pit_out_time: number | null;
  track_status: string | null;
  is_personal_best: boolean | null;
  deleted: boolean | null;
}

interface RawLapsResponse {
  year: number;
  round: number;
  event: string;
  circuit: string;
  session: string;
  drivers: Array<{
    code: string;
    team: string;
    number: number | null;
    full_name: string;
  }>;
  laps: RawLapRow[];
  n_laps: number;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new FastF1Error(
      `Network error contacting FastF1 sidecar: ${(err as Error).message}`,
      0,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new FastF1Error(
      `FastF1 sidecar returned non-JSON response (status ${res.status})`,
      res.status,
    );
  }

  if (!res.ok) {
    const errMsg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new FastF1Error(errMsg, res.status, body);
  }

  return body as T;
}

// ─── Public API ────────────────────────────────────────────────────────

export interface TelemetryOverlayInput {
  year: number;
  round: number;
  session: SessionCode;
  /** 1–4 driver codes (e.g. "VER", "NOR") */
  drivers: string[];
  /** "fastest" (default) or a specific lap number */
  lap?: "fastest" | number;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Fetch distance-aligned telemetry for up to 4 drivers.
 *
 * Throws {@link FastF1Error} on validation failures, archive misses, or
 * upstream errors. The error's `status` mirrors the Python sidecar's
 * HTTP status (400, 404, 500, 504).
 */
export async function fetchTelemetryOverlay(
  input: TelemetryOverlayInput,
): Promise<TelemetryOverlayResponse> {
  if (!Array.isArray(input.drivers) || input.drivers.length === 0) {
    throw new FastF1Error("at least one driver code is required", 400);
  }
  if (input.drivers.length > 4) {
    throw new FastF1Error("at most 4 drivers per request", 400);
  }

  const params = new URLSearchParams({
    year: String(input.year),
    round: String(input.round),
    session: input.session,
    drivers: input.drivers.join(","),
    lap: input.lap === undefined || input.lap === "fastest" ? "fastest" : String(input.lap),
  });

  const raw = await fetchJson<RawTelemetryResponse>(
    `/api/fastf1/telemetry?${params.toString()}`,
    input.signal,
  );

  return {
    drivers: raw.drivers.map((d) => ({
      code: d.code,
      team: d.team,
      lapTime: d.lap_time,
      compound: d.compound,
      lapNumber: d.lap_number,
      telemetry: d.telemetry,
    })),
    circuit: raw.circuit,
    event: raw.event,
    session: raw.session,
    year: raw.year,
    round: raw.round,
    nSamples: raw.n_samples,
    warnings: raw.warnings,
  };
}

export interface FastF1LapsInput {
  year: number;
  round: number;
  session: SessionCode;
  signal?: AbortSignal;
}

/**
 * Fetch enriched lap data for a session — lap times, sectors, compound,
 * stint, pit info — denormalized from the FastF1 laps DataFrame.
 */
export async function fetchFastF1Laps(
  input: FastF1LapsInput,
): Promise<FastF1LapsResponse> {
  const params = new URLSearchParams({
    year: String(input.year),
    round: String(input.round),
    session: input.session,
  });

  const raw = await fetchJson<RawLapsResponse>(
    `/api/fastf1/laps?${params.toString()}`,
    input.signal,
  );

  return {
    year: raw.year,
    round: raw.round,
    event: raw.event,
    circuit: raw.circuit,
    session: raw.session,
    drivers: raw.drivers.map((d) => ({
      code: d.code,
      team: d.team,
      number: d.number,
      fullName: d.full_name,
    })),
    laps: raw.laps.map((l) => ({
      driver: l.driver,
      driverNumber: l.driver_number,
      team: l.team,
      lapNumber: l.lap_number,
      lapTime: l.lap_time,
      sector1: l.sector_1,
      sector2: l.sector_2,
      sector3: l.sector_3,
      speedI1: l.speed_i1,
      speedI2: l.speed_i2,
      speedFL: l.speed_fl,
      speedST: l.speed_st,
      compound: l.compound,
      tyreLife: l.tyre_life,
      freshTyre: l.fresh_tyre,
      stint: l.stint,
      position: l.position,
      isPitIn: l.is_pit_in,
      isPitOut: l.is_pit_out,
      pitInTime: l.pit_in_time,
      pitOutTime: l.pit_out_time,
      trackStatus: l.track_status,
      isPersonalBest: l.is_personal_best,
      deleted: l.deleted,
    })),
    nLaps: raw.n_laps,
  };
}

export { FastF1Error };
