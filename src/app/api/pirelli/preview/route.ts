import { NextRequest, NextResponse } from "next/server";
import {
  getCompoundAllocation,
  type CompoundAllocation,
} from "@/data/pirelli-compounds";
import { sanitizeError, validateCircuitId } from "@/lib/api-validation";

/**
 * GET /api/pirelli/preview?circuit=<circuit-short-name>
 *
 * Returns Pirelli's compound allocation, minimum start pressures, and
 * estimated stint length for the requested circuit. Pirelli does not expose
 * a JSON API — they publish race-week press kits as HTML/PDF whose markup
 * changes year over year. Rather than scraping a moving target, we serve a
 * curated static dataset and tag the response with `source: "static"` so
 * the client can clearly attribute the data.
 *
 * Future hook: a `source: "live"` branch could attempt an HTML fetch from
 * pirelli.com and fall back to static on parse failure. Not built yet —
 * the static dataset is the dependable surface.
 *
 * Response shape (200):
 *   { allocation: CompoundAllocation | null, source: "static" }
 *
 * The 24-hour `revalidate` window matches reality: Pirelli's per-race
 * choices are locked weeks before the event. Race-week pressure tweaks
 * surface in the FIA tech bulletin on Friday evening, which is well outside
 * the cache TTL we'd otherwise need.
 */

interface PreviewResponse {
  allocation: CompoundAllocation | null;
  source: "static";
}

export async function GET(req: NextRequest) {
  const circuit = validateCircuitId(req.nextUrl.searchParams.get("circuit"));
  if (!circuit) {
    return NextResponse.json(
      { error: "Valid `circuit` (alphanumeric, hyphen) required" },
      { status: 400 },
    );
  }

  try {
    const allocation = getCompoundAllocation(circuit);

    const body: PreviewResponse = {
      allocation,
      source: "static",
    };

    // Compounds for an event don't change race-week, so a long
    // revalidation window is correct here. See `next.revalidate` —
    // 86400s = 24 hours.
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("Pirelli preview error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to load compound preview" },
      { status: 500 },
    );
  }
}

// Hint to Next.js's route-segment cache that this handler is safe to cache
// at the Vercel edge. 24h matches the data's true rate of change.
export const revalidate = 86400;
