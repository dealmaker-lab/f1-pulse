import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, sanitizeError } from "@/lib/api-validation";
import { openf1Fetch, OpenF1Error } from "@/lib/openf1-fetch";

/**
 * Proxy for OpenF1's `/race_control` endpoint.
 *
 * Validates `session_key`, rate-limits + error-guards the upstream call, and
 * accepts optional `date_gt` (ISO → OpenF1 `date>`) so a live poller fetches
 * only new race-control entries instead of the whole session each tick.
 *
 * Race control feed is the most time-critical "live" surface — the client's
 * polling drives freshness.
 */
export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(
    req.nextUrl.searchParams.get("session_key"),
  );
  const dateGt = req.nextUrl.searchParams.get("date_gt");
  if (!sessionKey) {
    return NextResponse.json(
      { error: "Valid session_key (positive integer) required" },
      { status: 400 },
    );
  }

  try {
    const data = await openf1Fetch<unknown[]>("race_control", {
      session_key: sessionKey,
      "date>": dateGt && !Number.isNaN(Date.parse(dateGt)) ? dateGt : undefined,
    });
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err) {
    const status = err instanceof OpenF1Error ? err.status : 502;
    console.error("race-control proxy error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to fetch race control" },
      { status },
    );
  }
}
