import { NextRequest, NextResponse } from "next/server";
import { findRaceThread } from "@/lib/reddit";
import { sanitizeError } from "@/lib/api-validation";

/**
 * GET /api/reddit/race-thread?race=<title>&date=<iso>
 *
 * Looks up r/formula1's official race-discussion thread for a given race
 * within ±48h of the supplied date. Returns thread metadata or 404.
 *
 * Response shape (200):
 *   { id: string; title: string; created: number; permalink: string }
 *
 * 404 when no thread is found in the search window. We surface this as a
 * proper not-found rather than 200-with-null so the client can branch on
 * status alone.
 */

const MAX_TITLE_LEN = 120;

function validateRaceTitle(val: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LEN) return null;
  // Allow letters, numbers, spaces, and a few punctuation marks that show
  // up in race names ("Sao Paulo Grand Prix", "Emilia-Romagna GP", etc.).
  // ASCII-only — \p{L}/\p{N} unicode classes require ES6 target.
  if (!/^[a-zA-Z0-9\s.\-'_&:()]+$/.test(trimmed)) return null;
  return trimmed;
}

function validateIsoDate(val: string | null): string | null {
  if (!val) return null;
  const ms = Date.parse(val);
  if (!Number.isFinite(ms)) return null;
  // Sanity-check range: 2010-01-01 .. 2100-01-01. Outside this we're
  // almost certainly being passed garbage.
  const min = Date.parse("2010-01-01T00:00:00Z");
  const max = Date.parse("2100-01-01T00:00:00Z");
  if (ms < min || ms > max) return null;
  return new Date(ms).toISOString();
}

export async function GET(req: NextRequest) {
  const race = validateRaceTitle(req.nextUrl.searchParams.get("race"));
  if (!race) {
    return NextResponse.json(
      { error: "Valid `race` (1-120 chars, letters/numbers/punctuation) required" },
      { status: 400 },
    );
  }

  const date = validateIsoDate(req.nextUrl.searchParams.get("date"));
  if (!date) {
    return NextResponse.json(
      { error: "Valid `date` (ISO 8601, 2010-2100) required" },
      { status: 400 },
    );
  }

  try {
    const thread = await findRaceThread(race, date);
    if (!thread) {
      return NextResponse.json(
        { error: "No race discussion thread found" },
        {
          status: 404,
          // 10-min cache for the 404 too — re-asking a minute later
          // for a race with no thread will hammer Reddit otherwise.
          headers: { "Cache-Control": "public, s-maxage=600" },
        },
      );
    }
    return NextResponse.json(thread, {
      headers: { "Cache-Control": "public, s-maxage=600" },
    });
  } catch (err) {
    console.error("race-thread fetch error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to fetch race thread" },
      { status: 502 },
    );
  }
}
