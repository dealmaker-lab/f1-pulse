import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, validateDriverNumber, sanitizeError } from "@/lib/api-validation";
import { openf1Fetch, OpenF1Error } from "@/lib/openf1-fetch";

/**
 * Car telemetry (~3.7Hz). A full race session is multi-MB per driver;
 * `sample=N` (1..50) decimates server-side for consumers that only need
 * coarse traces (the replay page keeps every 20th sample). Telemetry
 * deep-dive keeps full resolution by omitting the param.
 */
export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  const driverNumber = validateDriverNumber(req.nextUrl.searchParams.get("driver_number"));
  const sampleRaw = parseInt(req.nextUrl.searchParams.get("sample") || "1");
  const sample = Number.isFinite(sampleRaw) ? Math.min(50, Math.max(1, sampleRaw)) : 1;

  if (!sessionKey || !driverNumber) {
    return NextResponse.json(
      { error: "Valid session_key and driver_number (positive integers) required" },
      { status: 400 },
    );
  }

  try {
    const data = await openf1Fetch<unknown[]>("car_data", {
      session_key: sessionKey,
      driver_number: driverNumber,
    });
    if (!Array.isArray(data)) return NextResponse.json([]);

    const out = sample > 1 ? data.filter((_, idx) => idx % sample === 0) : data;
    return NextResponse.json(out, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (err) {
    const status = err instanceof OpenF1Error ? err.status : 500;
    console.error("Car data fetch error:", sanitizeError(err));
    return NextResponse.json({ error: "Failed to fetch car data" }, { status });
  }
}
