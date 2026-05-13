import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, sanitizeError } from "@/lib/api-validation";

/**
 * Proxy for OpenF1's `/race_control` endpoint.
 *
 * Reasons to proxy instead of hitting OpenF1 from the browser directly:
 *  - Validates `session_key` (positive integer) before forwarding
 *  - Centralizes upstream-URL config — moves with OpenF1 changes
 *  - Sanitizes upstream errors before they reach the client
 *  - Lets us cache/rate-limit later without touching consumers
 *
 * Race control feed is the most time-critical "live" surface — we use
 * `cache: "no-store"` upstream and let the client's polling drive freshness.
 */

const BASE = "https://api.openf1.org/v1";

export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(
    req.nextUrl.searchParams.get("session_key"),
  );
  if (!sessionKey) {
    return NextResponse.json(
      { error: "Valid session_key (positive integer) required" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `${BASE}/race_control?session_key=${sessionKey}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream API error" },
        { status: res.status },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("race-control proxy error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to fetch race control" },
      { status: 502 },
    );
  }
}
