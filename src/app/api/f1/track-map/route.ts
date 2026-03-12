import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openf1.org/v1";

interface LocationPoint {
  x: number;
  y: number;
  z: number;
  date: string;
  driver_number: number;
}

/**
 * GET /api/f1/track-map
 *
 * Returns two datasets:
 * 1. trackOutline — sampled x/y points from a single driver's lap to draw the circuit shape
 * 2. carPositions — all drivers' latest positions at a given point in time (or latest)
 *
 * Query params:
 *   session_key (required) — OpenF1 session key
 *   driver_number (optional) — for track outline, defaults to first available
 *   date_start (optional) — ISO timestamp to fetch positions around
 *   date_end (optional) — ISO timestamp end range
 *   mode — "outline" | "positions" | "both" (default: "both")
 */
export async function GET(req: NextRequest) {
  const sessionKey = req.nextUrl.searchParams.get("session_key");
  const driverNumber = req.nextUrl.searchParams.get("driver_number");
  const mode = req.nextUrl.searchParams.get("mode") || "both";
  const dateStart = req.nextUrl.searchParams.get("date_start");
  const dateEnd = req.nextUrl.searchParams.get("date_end");

  if (!sessionKey) {
    return NextResponse.json({ error: "session_key required" }, { status: 400 });
  }

  try {
    const result: {
      trackOutline?: { x: number; y: number }[];
      carPositions?: { driver_number: number; x: number; y: number; date: string }[];
      bounds?: { minX: number; maxX: number; minY: number; maxY: number };
    } = {};

    // --- Track outline: get ~90s of one driver's data to trace one full lap ---
    if (mode === "outline" || mode === "both") {
      // First, get the session start time from a small data slice
      const probeUrl = `${BASE}/location?session_key=${sessionKey}${
        driverNumber ? `&driver_number=${driverNumber}` : ""
      }`;

      // Get a broad sample: fetch first few seconds to find the time range,
      // then fetch ~100s (about 1 lap) starting ~5 minutes in (cars are on track)
      const sessionInfoUrl = `${BASE}/sessions?session_key=${sessionKey}`;
      const sessionRes = await fetch(sessionInfoUrl, { next: { revalidate: 3600 } });
      const sessionData = await sessionRes.json();
      const sessionInfo = Array.isArray(sessionData) ? sessionData[0] : sessionData;

      if (sessionInfo?.date_start) {
        const sessionStart = new Date(sessionInfo.date_start);
        // Skip first 20 minutes to get mid-race data where cars are spread around track
        const lapStart = new Date(sessionStart.getTime() + 20 * 60 * 1000);
        const lapEnd = new Date(lapStart.getTime() + 100 * 1000); // ~100 seconds = ~1 lap

        // Pick a driver for outline — use provided or find first available
        let outlineDriver = driverNumber || "1";

        const outlineUrl = `${BASE}/location?session_key=${sessionKey}&driver_number=${outlineDriver}&date>${lapStart.toISOString()}&date<${lapEnd.toISOString()}`;
        const outlineRes = await fetch(outlineUrl, { next: { revalidate: 3600 } });
        const outlineData: LocationPoint[] = await outlineRes.json();

        if (Array.isArray(outlineData) && outlineData.length > 0) {
          // Filter out zero coordinates and sample every 3rd point for smooth outline
          const validPoints = outlineData.filter(
            (p) => p.x !== 0 || p.y !== 0
          );
          const sampled = validPoints.filter((_, i) => i % 3 === 0);

          result.trackOutline = sampled.map((p) => ({ x: p.x, y: p.y }));

          // Calculate bounds
          const xs = sampled.map((p) => p.x);
          const ys = sampled.map((p) => p.y);
          result.bounds = {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
          };
        } else if (!driverNumber) {
          // Try different driver numbers if default didn't work
          for (const tryDriver of ["4", "44", "16", "55", "63", "81"]) {
            const retryUrl = `${BASE}/location?session_key=${sessionKey}&driver_number=${tryDriver}&date>${lapStart.toISOString()}&date<${lapEnd.toISOString()}`;
            const retryRes = await fetch(retryUrl, { next: { revalidate: 3600 } });
            const retryData: LocationPoint[] = await retryRes.json();
            if (Array.isArray(retryData) && retryData.length > 5) {
              const valid = retryData.filter((p) => p.x !== 0 || p.y !== 0);
              const s = valid.filter((_, i) => i % 3 === 0);
              result.trackOutline = s.map((p) => ({ x: p.x, y: p.y }));
              const xArr = s.map((p) => p.x);
              const yArr = s.map((p) => p.y);
              result.bounds = {
                minX: Math.min(...xArr),
                maxX: Math.max(...xArr),
                minY: Math.min(...yArr),
                maxY: Math.max(...yArr),
              };
              outlineDriver = tryDriver;
              break;
            }
          }
        }
      }
    }

    // --- Car positions: get all drivers' positions at a specific timestamp ---
    if (mode === "positions" || mode === "both") {
      if (dateStart && dateEnd) {
        const posUrl = `${BASE}/location?session_key=${sessionKey}&date>${dateStart}&date<${dateEnd}`;
        const posRes = await fetch(posUrl, { cache: "no-store" });
        const posData: LocationPoint[] = await posRes.json();

        if (Array.isArray(posData)) {
          // Get latest position per driver
          const latestByDriver = new Map<
            number,
            { driver_number: number; x: number; y: number; date: string }
          >();
          for (const p of posData) {
            if (p.x === 0 && p.y === 0) continue;
            const existing = latestByDriver.get(p.driver_number);
            if (!existing || p.date > existing.date) {
              latestByDriver.set(p.driver_number, {
                driver_number: p.driver_number,
                x: p.x,
                y: p.y,
                date: p.date,
              });
            }
          }
          result.carPositions = Array.from(latestByDriver.values());
        }
      }
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("Track map API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch track map data" },
      { status: 500 }
    );
  }
}
