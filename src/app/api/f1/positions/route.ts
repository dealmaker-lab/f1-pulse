import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, sanitizeError } from "@/lib/api-validation";

const BASE = "https://api.openf1.org/v1";

export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  if (!sessionKey) {
    return NextResponse.json({ error: "Valid session_key (positive integer) required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${BASE}/position?session_key=${sessionKey}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Upstream API error" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Positions fetch error:", sanitizeError(err));
    return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
  }
}
