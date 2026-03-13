import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, validateDriverNumber, sanitizeError } from "@/lib/api-validation";

const BASE = "https://api.openf1.org/v1";

export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  const driverNumber = validateDriverNumber(req.nextUrl.searchParams.get("driver_number"));

  if (!sessionKey) {
    return NextResponse.json({ error: "Valid session_key (positive integer) required" }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({ session_key: String(sessionKey) });
    if (driverNumber) params.set("driver_number", String(driverNumber));

    const res = await fetch(`${BASE}/laps?${params}`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Upstream API error" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Laps fetch error:", sanitizeError(err));
    return NextResponse.json({ error: "Failed to fetch laps" }, { status: 500 });
  }
}
