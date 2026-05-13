/**
 * TracingInsights CDN client — historical telemetry without the FastF1
 * Python sidecar cold start.
 *
 * TracingInsights publishes flat per-driver / per-lap telemetry JSON for
 * every 2026 GP at:
 *   https://github.com/TracingInsights/2026
 *
 * Distributed via jsDelivr (CORS-open, CDN-cached, free):
 *   https://cdn.jsdelivr.net/gh/TracingInsights/2026@main/...
 *
 * Repo layout (verified 2026-05-13):
 *   `{GP Name}/{Session Name}/{DRIVER}/{lap}_tel.json`  — telemetry per lap
 *   `{GP Name}/{Session Name}/{DRIVER}/laptimes.json`    — laptime + compound
 *   `{GP Name}/{Session Name}/drivers.json`              — driver entry list
 *   `{GP Name}/{Session Name}/session_laptimes.json`     — session summary
 *
 * GP names match Ergast/Jolpica `raceName` exactly (e.g. "Australian Grand
 * Prix"). Session names use FastF1's long form: "Practice 1/2/3",
 * "Qualifying", "Sprint Qualifying", "Sprint", "Race".
 *
 * Telemetry JSON shape (verified against VER 2026 Australian GP lap 43):
 *   {
 *     "tel": {
 *       "time": number[],     // seconds from lap start
 *       "speed": number[],    // km/h
 *       "throttle": number[], // 0–100
 *       "brake": number[],    // 0 or 1
 *       "gear": number[],     // 0–8
 *       "drs": number[],      // 0/1/10/12/14 — see DATA_REFERENCE.md
 *       "distance": number[], // metres along lap
 *       "rpm": number[], "x": number[], "y": number[], "z": number[],
 *       "acc_x": number[], "acc_y": number[], "acc_z": number[],
 *       "rel_distance": number[], "DriverAhead": (string|null)[],
 *       "DistanceToDriverAhead": number[], "dataKey": string
 *     }
 *   }
 *
 * Laptimes JSON shape:
 *   { "time": number[], "lap": number[], "compound": string[] }
 *
 * Used as the FIRST attempt for historical (year < CURRENT_YEAR) telemetry
 * in `fetchTelemetryOverlay`. Falls back to the FastF1 Python sidecar on
 * miss / fetch failure.
 *
 * Data is immutable once published — Next.js `revalidate: 30 days` is safe.
 */

import type { SessionCode, TelemetryDriver, TelemetrySample } from "./fastf1-client";

const CDN_BASE = "https://cdn.jsdelivr.net/gh/TracingInsights/2026@main";

/**
 * 30 days — historical race telemetry never changes after publication, so
 * Next.js can keep it warm for a long time. We still validate via HEAD on
 * cache miss anyway.
 */
const REVALIDATE_SECONDS = 60 * 60 * 24 * 30;

/** Default number of distance-aligned samples to produce, matching FastF1. */
const DEFAULT_N_SAMPLES = 500;

/**
 * Map SessionCode → folder name used by TracingInsights. These are the
 * long-form FastF1 session names (verified against the published repo).
 */
const SESSION_FOLDER: Record<SessionCode, string> = {
  FP1: "Practice 1",
  FP2: "Practice 2",
  FP3: "Practice 3",
  Q: "Qualifying",
  SQ: "Sprint Qualifying",
  S: "Sprint",
  R: "Race",
};

/**
 * Encode a path segment that may contain spaces (e.g. "Australian Grand
 * Prix"). We can't use `encodeURIComponent` wholesale because the upstream
 * GitHub raw URL preserves the literal slash separator — `%2F` would 404.
 */
function encodeSegment(seg: string): string {
  return encodeURIComponent(seg);
}

/**
 * Build a path under the CDN base for a (gp, session, ...segments) tuple.
 */
function cdnUrl(gp: string, session: SessionCode, ...rest: string[]): string {
  const parts = [encodeSegment(gp), encodeSegment(SESSION_FOLDER[session])];
  for (const r of rest) parts.push(encodeSegment(r));
  return `${CDN_BASE}/${parts.join("/")}`;
}

/**
 * Resolve a round number → Jolpica `raceName` ("Australian Grand Prix")
 * for the given year. Cached per (year, round) by Next.js fetch since the
 * schedule is stable for the year.
 *
 * Returns `null` if we can't resolve — caller should fall back to FastF1.
 */
async function resolveRaceName(
  year: number,
  round: number,
): Promise<string | null> {
  const url = `https://api.jolpi.ca/ergast/f1/${year}/${round}.json`;
  let res: Response;
  try {
    // Schedule is immutable for past seasons; cache long. We use the Next
    // `revalidate` extension which is a no-op outside Next but tolerated.
    res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
    } as RequestInit);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  // Defensive: Jolpica/Ergast schema is `MRData.RaceTable.Races[0].raceName`.
  if (typeof body !== "object" || body === null) return null;
  const mr = (body as { MRData?: unknown }).MRData;
  if (typeof mr !== "object" || mr === null) return null;
  const rt = (mr as { RaceTable?: unknown }).RaceTable;
  if (typeof rt !== "object" || rt === null) return null;
  const races = (rt as { Races?: unknown }).Races;
  if (!Array.isArray(races) || races.length === 0) return null;
  const first = races[0];
  if (typeof first !== "object" || first === null) return null;
  const name = (first as { raceName?: unknown }).raceName;
  return typeof name === "string" && name.length > 0 ? name : null;
}

/**
 * Lightweight existence probe. HEAD against the drivers.json index file
 * for the (year, round, session) tuple. If that 200s, the GP+session
 * directory exists on the CDN.
 *
 * Note: jsDelivr serves HEAD identically to GET (cached). We don't follow
 * redirects manually — fetch handles them.
 */
export async function tracingInsightsAvailable(
  year: number,
  round: number,
  session: SessionCode = "R",
): Promise<boolean> {
  if (year !== 2026) return false;
  const gp = await resolveRaceName(year, round);
  if (!gp) return false;
  const url = cdnUrl(gp, session, "drivers.json");
  try {
    const res = await fetch(url, {
      method: "HEAD",
      next: { revalidate: REVALIDATE_SECONDS },
    } as RequestInit);
    return res.ok;
  } catch {
    return false;
  }
}

interface RawTelPayload {
  tel?: {
    time?: number[];
    speed?: number[];
    throttle?: number[];
    brake?: number[];
    gear?: number[];
    drs?: number[];
    distance?: number[];
  };
}

interface RawLaptimes {
  time?: number[];
  lap?: number[];
  compound?: string[];
}

/**
 * Parse a TracingInsights telemetry JSON into our internal TelemetrySample
 * shape, resampled to `nSamples` evenly-spaced distance points.
 *
 * Returns null if the payload is missing any required column (defensive —
 * TracingInsights occasionally publishes partial files for crashed laps).
 */
function resampleTelemetry(
  raw: RawTelPayload,
  nSamples: number,
): TelemetrySample[] | null {
  const t = raw.tel;
  if (!t) return null;
  const { distance, speed, throttle, brake, gear, drs } = t;
  if (
    !Array.isArray(distance) ||
    !Array.isArray(speed) ||
    !Array.isArray(throttle) ||
    !Array.isArray(brake) ||
    !Array.isArray(gear) ||
    !Array.isArray(drs)
  ) {
    return null;
  }
  const n = distance.length;
  if (n < 2) return null;
  // All parallel arrays must match length (TracingInsights guarantees this
  // but we'd rather fall back than crash on a bad publish).
  if (
    speed.length !== n ||
    throttle.length !== n ||
    brake.length !== n ||
    gear.length !== n ||
    drs.length !== n
  ) {
    return null;
  }

  const dMin = distance[0];
  const dMax = distance[n - 1];
  if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || dMax <= dMin) {
    return null;
  }

  // Linear interpolation between the bracketing raw samples for each
  // target distance. distance[] is monotonically increasing per the
  // DATA_REFERENCE spec, so we can walk with a cursor in O(n).
  const samples: TelemetrySample[] = new Array(nSamples);
  let cursor = 0;
  for (let i = 0; i < nSamples; i++) {
    const target = dMin + ((dMax - dMin) * i) / (nSamples - 1);
    while (cursor < n - 2 && distance[cursor + 1] < target) cursor++;
    const d0 = distance[cursor];
    const d1 = distance[cursor + 1];
    const span = d1 - d0;
    const frac = span > 0 ? (target - d0) / span : 0;
    // TracingInsights' DRS field uses F1 codes 0/1/10/12/14. We normalise
    // to 0/1 to match the FastF1 sidecar's shape (which already does this
    // server-side). Codes 10/12/14 = active, anything else = off.
    const drs0 = drs[cursor];
    const drsActive = drs0 === 10 || drs0 === 12 || drs0 === 14 ? 1 : 0;
    samples[i] = {
      distance: target,
      speed: speed[cursor] + (speed[cursor + 1] - speed[cursor]) * frac,
      throttle:
        throttle[cursor] + (throttle[cursor + 1] - throttle[cursor]) * frac,
      // Brake & gear are step functions — nearest-neighbour rather than
      // interpolated. Otherwise we'd produce nonsensical 0.5-brake values.
      brake: brake[cursor] >= 0.5 ? 1 : 0,
      gear: Math.round(gear[cursor]),
      drs: drsActive,
    };
  }
  return samples;
}

/**
 * Pick the fastest valid lap for a driver from their laptimes.json. A
 * lap is "valid" if it has a positive time. We return the lap number
 * (1-indexed, matches the `{N}_tel.json` filename) along with the lap
 * time and compound.
 *
 * Returns null if the driver has no valid laps.
 */
function pickFastestLap(
  lt: RawLaptimes,
): { lapNumber: number; lapTime: number; compound: string } | null {
  if (!Array.isArray(lt.time) || !Array.isArray(lt.lap)) return null;
  if (lt.time.length === 0 || lt.time.length !== lt.lap.length) return null;
  let bestIdx = -1;
  let bestTime = Infinity;
  for (let i = 0; i < lt.time.length; i++) {
    const t = lt.time[i];
    if (typeof t === "number" && t > 0 && t < bestTime) {
      bestTime = t;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  const compound = Array.isArray(lt.compound) ? lt.compound[bestIdx] : "";
  return {
    lapNumber: lt.lap[bestIdx],
    lapTime: bestTime,
    compound: typeof compound === "string" ? compound : "",
  };
}

async function fetchJsonCached<T>(url: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
    } as RequestInit);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface TracingInsightsFetchInput {
  year: number;
  round: number;
  session: SessionCode;
  driverCodes: string[];
  /** Override resampling resolution. Defaults to 500 (matches FastF1 sidecar). */
  nSamples?: number;
  /**
   * Pre-resolved GP name (e.g. "Australian Grand Prix"). When provided we
   * skip the Jolpica lookup — useful if the caller already has it.
   */
  raceName?: string;
}

export interface TracingInsightsResult {
  drivers: TelemetryDriver[];
  raceName: string;
  /** Per-driver warnings — e.g. "no fastest lap found". */
  warnings: string[];
}

/**
 * Fetch fastest-lap telemetry for up to N drivers from TracingInsights and
 * return data in the same shape as the FastF1 sidecar.
 *
 * Throws if the GP can't be resolved or no driver returned any data —
 * the caller is expected to catch and fall back to the FastF1 sidecar.
 *
 * Currently only fetches the FASTEST lap per driver (matching the most
 * common use case in this codebase). Specific-lap support could be added
 * by accepting a `lap` parameter and skipping `pickFastestLap`.
 */
export async function fetchTracingInsightsTelemetry(
  input: TracingInsightsFetchInput,
): Promise<TracingInsightsResult> {
  const { year, round, session, driverCodes } = input;
  const nSamples = input.nSamples ?? DEFAULT_N_SAMPLES;

  const raceName = input.raceName ?? (await resolveRaceName(year, round));
  if (!raceName) {
    throw new Error(
      `TracingInsights: could not resolve raceName for ${year} round ${round}`,
    );
  }

  const warnings: string[] = [];
  const drivers: TelemetryDriver[] = [];

  // Fan out one fetch pair (laptimes + tel) per driver in parallel.
  await Promise.all(
    driverCodes.map(async (code) => {
      const lt = await fetchJsonCached<RawLaptimes>(
        cdnUrl(raceName, session, code, "laptimes.json"),
      );
      if (!lt) {
        warnings.push(`${code}: laptimes.json missing`);
        return;
      }
      const fastest = pickFastestLap(lt);
      if (!fastest) {
        warnings.push(`${code}: no valid fastest lap`);
        return;
      }
      const tel = await fetchJsonCached<RawTelPayload>(
        cdnUrl(raceName, session, code, `${fastest.lapNumber}_tel.json`),
      );
      if (!tel) {
        warnings.push(
          `${code}: telemetry missing for lap ${fastest.lapNumber}`,
        );
        return;
      }
      const samples = resampleTelemetry(tel, nSamples);
      if (!samples) {
        warnings.push(
          `${code}: telemetry payload malformed for lap ${fastest.lapNumber}`,
        );
        return;
      }
      drivers.push({
        code,
        // TracingInsights doesn't publish team-per-lap in this file — leave
        // empty so the UI can render code+lap-time without misattribution.
        // FastF1 fallback fills this when needed.
        team: "",
        lapTime: fastest.lapTime,
        compound: fastest.compound,
        lapNumber: fastest.lapNumber,
        telemetry: samples,
      });
    }),
  );

  if (drivers.length === 0) {
    throw new Error(
      `TracingInsights: no driver returned telemetry (${warnings.join("; ")})`,
    );
  }

  return { drivers, raceName, warnings };
}
