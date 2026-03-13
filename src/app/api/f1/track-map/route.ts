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
        // Try multiple time windows to find a good complete lap outline
        // Different offsets help for different session types (race vs qualifying)
        const offsets = [20, 30, 10, 40, 5]; // minutes into session
        const lapDuration = 130; // seconds — generous to ensure full lap capture

        // Candidate driver numbers to try (common across 2024-2026 grids)
        const candidateDrivers = driverNumber
          ? [driverNumber]
          : ["1", "4", "44", "16", "55", "63", "81", "11", "14", "22", "27", "10", "31", "23", "2", "18", "77", "24", "20", "3"];

        let bestOutline: { x: number; y: number }[] = [];
        let bestBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

        for (const offset of offsets) {
          if (bestOutline.length > 50) break; // good enough
          const lapStart = new Date(sessionStart.getTime() + offset * 60 * 1000);
          const lapEnd = new Date(lapStart.getTime() + lapDuration * 1000);

          for (const tryDriver of candidateDrivers) {
            const outlineUrl = `${BASE}/location?session_key=${sessionKey}&driver_number=${tryDriver}&date>${lapStart.toISOString()}&date<${lapEnd.toISOString()}`;
            const outlineRes = await fetch(outlineUrl, { next: { revalidate: 3600 } });
            const outlineData: LocationPoint[] = await outlineRes.json();

            if (Array.isArray(outlineData) && outlineData.length > 20) {
              const validPoints = outlineData.filter((p) => p.x !== 0 || p.y !== 0);
              const sampled = validPoints.filter((_, i) => i % 3 === 0);

              if (sampled.length > bestOutline.length) {
                bestOutline = sampled.map((p) => ({ x: p.x, y: p.y }));
                const xs = sampled.map((p) => p.x);
                const ys = sampled.map((p) => p.y);
                bestBounds = {
                  minX: Math.min(...xs),
                  maxX: Math.max(...xs),
                  minY: Math.min(...ys),
                  maxY: Math.max(...ys),
                };
              }
              if (sampled.length > 50) break; // found a good outline
            }
          }
        }

        if (bestOutline.length > 0) {
          result.trackOutline = bestOutline;
          result.bounds = bestBounds;
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
