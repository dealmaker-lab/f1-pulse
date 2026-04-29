import { NextRequest, NextResponse } from "next/server";
import { getCircuitCoords } from "@/lib/circuit-coords";
import { sanitizeError, validateCircuitId } from "@/lib/api-validation";

/**
 * GET /api/weather/forecast?circuit=<circuit-short-name>&hours=<1..168>
 *
 * Proxies Open-Meteo (free, no auth required) for the next N hours of
 * weather at a circuit's coordinates. We proxy server-side so the browser
 * never hits Open-Meteo directly — keeps third-party usage centralized,
 * lets us cache responses, and lets us swap providers later without
 * touching the client.
 *
 * Response shape (200):
 *   Array<{
 *     time: string;        // ISO-ish, in circuit local time
 *     temp: number;        // °C, 1 decimal
 *     precipMm: number;    // millimetres, 1 decimal
 *     precipProb: number;  // 0..100
 *     windKph: number;     // km/h, integer
 *   }>
 */

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_HOURS = 24;
const MIN_HOURS = 1;
const MAX_HOURS = 168; // 7 days — Open-Meteo's free-tier ceiling.

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    precipitation?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
  };
}

function parseHours(raw: string | null): number {
  if (!raw) return DEFAULT_HOURS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_HOURS || n > MAX_HOURS) return DEFAULT_HOURS;
  return n;
}

export async function GET(req: NextRequest) {
  const circuitParam = validateCircuitId(req.nextUrl.searchParams.get("circuit"));
  if (!circuitParam) {
    return NextResponse.json(
      { error: "Valid `circuit` (alphanumeric, hyphen) required" },
      { status: 400 },
    );
  }

  const coords = getCircuitCoords(circuitParam);
  if (!coords) {
    return NextResponse.json(
      { error: `Unknown circuit: ${circuitParam}` },
      { status: 400 },
    );
  }

  const hours = parseHours(req.nextUrl.searchParams.get("hours"));

  const url = new URL(OPEN_METEO);
  url.searchParams.set("latitude", String(coords.lat));
  url.searchParams.set("longitude", String(coords.lon));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation,precipitation_probability,wind_speed_10m",
  );
  url.searchParams.set("timezone", coords.tz);
  url.searchParams.set("forecast_hours", String(hours));
  url.searchParams.set("wind_speed_unit", "kmh");

  try {
    // 10-minute revalidation: hourly forecasts don't change second by
    // second, and a tighter window would burn quota if the page is
    // popular without buying us anything visible.
    const res = await fetch(url.toString(), {
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      console.error(
        `Open-Meteo upstream error: status=${res.status} for circuit=${circuitParam}`,
      );
      return NextResponse.json(
        { error: "Forecast provider unavailable" },
        { status: 502 },
      );
    }

    const json = (await res.json()) as OpenMeteoResponse;
    const h = json.hourly ?? {};
    const times = h.time ?? [];
    const temps = h.temperature_2m ?? [];
    const precip = h.precipitation ?? [];
    const probs = h.precipitation_probability ?? [];
    const winds = h.wind_speed_10m ?? [];

    // Open-Meteo returns parallel arrays — zip into a single array of
    // points. Skip any index where time is missing (defensive — Open-Meteo
    // usually returns full data, but we don't want a malformed response
    // from upstream to cascade into a UI crash).
    const out = times
      .map((t, i) => {
        if (!t) return null;
        return {
          time: t,
          temp: roundTo(temps[i], 1) ?? 0,
          precipMm: roundTo(precip[i], 1) ?? 0,
          precipProb: clampInt(probs[i], 0, 100),
          windKph: clampInt(winds[i], 0, 999),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return NextResponse.json(out);
  } catch (err) {
    console.error("Forecast fetch error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to fetch forecast" },
      { status: 502 },
    );
  }
}

function roundTo(v: number | null | undefined, decimals: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const m = 10 ** decimals;
  return Math.round(v * m) / m;
}

function clampInt(
  v: number | null | undefined,
  min: number,
  max: number,
): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(min, Math.min(max, Math.round(v)));
}
