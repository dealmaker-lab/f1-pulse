import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openf1.org/v1";

// Fetch car location data for ALL drivers in a session
// This returns x,y,z coordinates at ~3.7Hz
// We sample to reduce data volume (every ~2 seconds)
export async function GET(req: NextRequest) {
  const sessionKey = req.nextUrl.searchParams.get("session_key");
  const driverNumber = req.nextUrl.searchParams.get("driver_number");

  if (!sessionKey) {
    return NextResponse.json({ error: "session_key required" }, { status: 400 });
  }

  try {
    let url = `${BASE}/location?session_key=${sessionKey}`;
    if (driverNumber) url += `&driver_number=${driverNumber}`;

    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch location" }, { status: 500 });
  }
}
