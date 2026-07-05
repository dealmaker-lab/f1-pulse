import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, sanitizeError } from "@/lib/api-validation";
import { openf1Fetch } from "@/lib/openf1-fetch";

interface LocationPoint {
  x: number;
  y: number;
  z: number;
  date: string;
  driver_number: number;
}

interface MultiViewerCircuit {
  x: number[];
  y: number[];
  rotation: number;
  corners: Array<{
    number: number;
    angle: number;
    trackPosition: { x: number; y: number };
  }>;
  marshalSectors: Array<{
    number: number;
    angle: number;
    trackPosition: { x: number; y: number };
  }>;
}

export interface TrackMapCorner {
  number: number;
  x: number;
  y: number;
}

export interface TrackMapMarshalSector {
  number: number;
  x: number;
  y: number;
}

/**
 * GET /api/f1/track-map
 *
 * Query params:
 *   session_key (required) — OpenF1 session key
 *   driver_number (optional) — for the OpenF1-probe fallback outline
 *   date_start / date_end (optional) — ISO range for mode=positions
 *   mode — "outline" | "positions" | "both" (default: "both")
 *
 * Outline strategy: MultiViewer's circuits API first (exact geometry,
 * corner numbers, TRUE marshal-sector boundaries — all in OpenF1's
 * coordinate space, one cached fetch), falling back to reconstructing a
 * lap from OpenF1 location data. The old fallback could fan out into
 * 100 upstream fetches (5 offsets × 20 drivers); it is now bounded.
 */
export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  const driverNumber = req.nextUrl.searchParams.get("driver_number");
  const mode = req.nextUrl.searchParams.get("mode") || "both";
  const dateStart = req.nextUrl.searchParams.get("date_start");
  const dateEnd = req.nextUrl.searchParams.get("date_end");

  if (!sessionKey) {
    return NextResponse.json(
      { error: "Valid session_key (positive integer) required" },
      { status: 400 },
    );
  }
  // Bound the positions window to 10 minutes so a wide range can't pull an
  // entire session's location feed into memory.
  if (dateStart && dateEnd) {
    const spanMs = new Date(dateEnd).getTime() - new Date(dateStart).getTime();
    if (!Number.isFinite(spanMs) || spanMs < 0 || spanMs > 10 * 60 * 1000) {
      return NextResponse.json(
        { error: "date_start..date_end window must be 0-10 minutes" },
        { status: 400 },
      );
    }
  }

  try {
    const result: {
      trackOutline?: { x: number; y: number }[];
      carPositions?: { driver_number: number; x: number; y: number; date: string }[];
      bounds?: { minX: number; maxX: number; minY: number; maxY: number };
      corners?: TrackMapCorner[];
      marshalSectors?: TrackMapMarshalSector[];
      rotation?: number;
      outlineSource?: "multiviewer" | "openf1";
    } = {};

    if (mode === "outline" || mode === "both") {
      const sessionData = await openf1Fetch<
        Array<{ circuit_key?: number; year?: number; date_start?: string }>
      >("sessions", { session_key: sessionKey }, { revalidate: 3600 });
      const sessionInfo = Array.isArray(sessionData) ? sessionData[0] : undefined;

      // ── Primary: MultiViewer exact geometry ──
      if (sessionInfo?.circuit_key && sessionInfo?.year) {
        try {
          const mvRes = await fetch(
            `https://api.multiviewer.app/api/v1/circuits/${sessionInfo.circuit_key}/${sessionInfo.year}`,
            { next: { revalidate: 7200 } },
          );
          if (mvRes.ok) {
            const mv = (await mvRes.json()) as MultiViewerCircuit;
            if (Array.isArray(mv.x) && mv.x.length > 50 && mv.x.length === mv.y.length) {
              result.trackOutline = mv.x.map((x, i) => ({ x, y: mv.y[i] }));
              result.bounds = {
                minX: Math.min(...mv.x),
                maxX: Math.max(...mv.x),
                minY: Math.min(...mv.y),
                maxY: Math.max(...mv.y),
              };
              result.corners = (mv.corners ?? []).map((c) => ({
                number: c.number,
                x: c.trackPosition.x,
                y: c.trackPosition.y,
              }));
              result.marshalSectors = (mv.marshalSectors ?? []).map((s) => ({
                number: s.number,
                x: s.trackPosition.x,
                y: s.trackPosition.y,
              }));
              result.rotation = mv.rotation;
              result.outlineSource = "multiviewer";
            }
          }
        } catch {
          // Unofficial endpoint, no SLA — fall through to the OpenF1 probe.
        }
      }

      // ── Fallback: reconstruct one lap from OpenF1 location data ──
      if (!result.trackOutline && sessionInfo?.date_start) {
        const sessionStart = new Date(sessionInfo.date_start);
        const offsets = [20, 30, 10]; // minutes into session
        const lapDuration = 130; // seconds
        const candidateDrivers = driverNumber
          ? [driverNumber]
          : ["1", "44", "16", "63", "81"];

        let bestOutline: { x: number; y: number }[] = [];
        let bestBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

        outer: for (const offset of offsets) {
          const lapStart = new Date(sessionStart.getTime() + offset * 60 * 1000);
          const lapEnd = new Date(lapStart.getTime() + lapDuration * 1000);

          for (const tryDriver of candidateDrivers) {
            const outlineData = await openf1Fetch<LocationPoint[]>(
              "location",
              {
                session_key: sessionKey,
                driver_number: tryDriver,
                "date>": lapStart.toISOString(),
                "date<": lapEnd.toISOString(),
              },
              { revalidate: 3600 },
            ).catch(() => [] as LocationPoint[]);

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
              if (sampled.length > 50) break outer;
            }
          }
        }

        if (bestOutline.length > 0) {
          result.trackOutline = bestOutline;
          result.bounds = bestBounds;
          result.outlineSource = "openf1";
        }
      }
    }

    // --- Car positions: all drivers' latest positions in a bounded window ---
    if ((mode === "positions" || mode === "both") && dateStart && dateEnd) {
      const posData = await openf1Fetch<LocationPoint[]>("location", {
        session_key: sessionKey,
        "date>": dateStart,
        "date<": dateEnd,
      });

      if (Array.isArray(posData)) {
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

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("Track map API error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to fetch track map data" },
      { status: 500 },
    );
  }
}
