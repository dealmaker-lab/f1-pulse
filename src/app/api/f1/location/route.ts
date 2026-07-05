import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, validateDriverNumber, sanitizeError } from "@/lib/api-validation";
import { openf1Fetch, OpenF1Error } from "@/lib/openf1-fetch";

interface LocationEntry {
  date: string;
  x: number;
  y: number;
  z?: number;
  driver_number?: number;
}

/**
 * Car location for a session (~3.7Hz per driver from OpenF1).
 *
 * Full-resolution location for a whole race is tens of MB per driver, and
 * the replay client used to download it all and immediately discard 3 of
 * every 4 points. `sample=N` (1..50) decimates server-side, and `slim=1`
 * strips entries down to {date,x,y} after dropping (0,0) pit/grid points —
 * together they cut the transfer by ~90%.
 */
export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  const driverNumber = validateDriverNumber(req.nextUrl.searchParams.get("driver_number"));
  const sampleRaw = parseInt(req.nextUrl.searchParams.get("sample") || "1");
  const sample = Number.isFinite(sampleRaw) ? Math.min(50, Math.max(1, sampleRaw)) : 1;
  const slim = req.nextUrl.searchParams.get("slim") === "1";

  if (!sessionKey) {
    return NextResponse.json(
      { error: "Valid session_key (positive integer) required" },
      { status: 400 },
    );
  }

  try {
    const data = await openf1Fetch<LocationEntry[]>("location", {
      session_key: sessionKey,
      driver_number: driverNumber ?? undefined,
    });
    if (!Array.isArray(data)) return NextResponse.json([]);

    let out: LocationEntry[] = data;
    if (slim) {
      out = out.filter((p) => p.x !== 0 || p.y !== 0);
    }
    if (sample > 1) {
      out = out.filter((_, idx) => idx % sample === 0);
    }
    if (slim) {
      out = out.map((p) => ({ date: p.date, x: p.x, y: p.y }));
    }

    return NextResponse.json(out, {
      // Historical sessions never change; live-window data isn't on the
      // free tier anyway, so a short edge cache is safe and saves upstream.
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (err) {
    const status = err instanceof OpenF1Error ? err.status : 500;
    console.error("Location fetch error:", sanitizeError(err));
    return NextResponse.json({ error: "Failed to fetch location" }, { status });
  }
}
