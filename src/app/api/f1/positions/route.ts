import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, sanitizeError } from "@/lib/api-validation";
import { openf1Fetch, OpenF1Error } from "@/lib/openf1-fetch";

/**
 * Position changes for a session.
 *
 * Optional `date_gt` (ISO) forwards to OpenF1's `date>` filter so a live
 * poller can request only entries newer than what it already has instead of
 * re-downloading the whole session's position history every tick.
 */
export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  const dateGt = req.nextUrl.searchParams.get("date_gt");
  if (!sessionKey) {
    return NextResponse.json(
      { error: "Valid session_key (positive integer) required" },
      { status: 400 },
    );
  }

  try {
    const data = await openf1Fetch<unknown[]>("position", {
      session_key: sessionKey,
      "date>": dateGt && !Number.isNaN(Date.parse(dateGt)) ? dateGt : undefined,
    });
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err) {
    const status = err instanceof OpenF1Error ? err.status : 500;
    console.error("Positions fetch error:", sanitizeError(err));
    return NextResponse.json({ error: "Failed to fetch positions" }, { status });
  }
}
