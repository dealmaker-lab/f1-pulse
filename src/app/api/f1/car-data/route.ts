import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openf1.org/v1";

export async function GET(req: NextRequest) {
  const sessionKey = req.nextUrl.searchParams.get("session_key");
  const driverNumber = req.nextUrl.searchParams.get("driver_number");

  if (!sessionKey || !driverNumber) {
    return NextResponse.json(
      { error: "session_key and driver_number are required" },
      { status: 400 }
    );
  }

  try {
    // Fetch car telemetry data
    const res = await fetch(
      `${BASE}/car_data?session_key=${sessionKey}&driver_number=${driverNumber}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenF1 returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch car data" },
      { status: 500 }
    );
  }
}
