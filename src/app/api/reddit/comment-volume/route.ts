import { NextRequest, NextResponse } from "next/server";
import { fetchCommentTimestamps } from "@/lib/reddit";
import { sanitizeError } from "@/lib/api-validation";

/**
 * GET /api/reddit/comment-volume?thread=<id>&race_start=<iso>&race_end=<iso>
 *
 * Fetches every comment from a Reddit thread, buckets timestamps into
 * 1-minute bins between race_start and race_end + 30min (post-race
 * reactions still spike for a while after the chequered flag).
 *
 * Response shape (200):
 *   {
 *     bins: Array<{ minute: number; count: number }>,  // minute is offset from race_start
 *     total: number,                                    // total comments inside window
 *     peak: { minute: number; count: number }           // bin with max count
 *   }
 *
 * 5-min revalidation — comment volume can shift quickly during a live
 * race, but a tighter window would burn through Reddit's rate limit if
 * the page is opened in many tabs.
 */

const POST_RACE_PADDING_MS = 30 * 60 * 1000;
const MAX_RACE_DURATION_MS = 5 * 60 * 60 * 1000; // 5h sanity bound (longest race ever ~4h)
const BIN_MS = 60 * 1000;

function validateThreadId(val: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  // Reddit thread IDs are short base36 (typically 6-7 chars).
  if (!/^[a-z0-9]{1,12}$/i.test(trimmed)) return null;
  return trimmed;
}

function validateIsoDate(val: string | null): number | null {
  if (!val) return null;
  const ms = Date.parse(val);
  if (!Number.isFinite(ms)) return null;
  const min = Date.parse("2010-01-01T00:00:00Z");
  const max = Date.parse("2100-01-01T00:00:00Z");
  if (ms < min || ms > max) return null;
  return ms;
}

export async function GET(req: NextRequest) {
  const thread = validateThreadId(req.nextUrl.searchParams.get("thread"));
  if (!thread) {
    return NextResponse.json(
      { error: "Valid `thread` (alphanumeric Reddit ID) required" },
      { status: 400 },
    );
  }

  const startMs = validateIsoDate(req.nextUrl.searchParams.get("race_start"));
  if (startMs === null) {
    return NextResponse.json(
      { error: "Valid `race_start` (ISO 8601) required" },
      { status: 400 },
    );
  }

  const endMs = validateIsoDate(req.nextUrl.searchParams.get("race_end"));
  if (endMs === null) {
    return NextResponse.json(
      { error: "Valid `race_end` (ISO 8601) required" },
      { status: 400 },
    );
  }

  if (endMs <= startMs) {
    return NextResponse.json(
      { error: "`race_end` must be after `race_start`" },
      { status: 400 },
    );
  }
  if (endMs - startMs > MAX_RACE_DURATION_MS) {
    return NextResponse.json(
      { error: "Race window too large (max 5 hours)" },
      { status: 400 },
    );
  }

  try {
    const timestamps = await fetchCommentTimestamps(thread);

    const windowStart = startMs;
    const windowEnd = endMs + POST_RACE_PADDING_MS;
    const totalMinutes = Math.ceil((windowEnd - windowStart) / BIN_MS);

    // Pre-allocate every minute bucket so the chart's x-axis is dense
    // and continuous — gaps in a sparse array would render as missing
    // ticks and confuse the eye.
    const bins: { minute: number; count: number }[] = [];
    for (let m = 0; m < totalMinutes; m++) {
      bins.push({ minute: m, count: 0 });
    }

    let total = 0;
    for (const tsSec of timestamps) {
      const tsMs = tsSec * 1000;
      if (tsMs < windowStart || tsMs >= windowEnd) continue;
      const minute = Math.floor((tsMs - windowStart) / BIN_MS);
      // Belt-and-braces — we already bounds-checked, but a clamp here
      // guarantees we never out-of-bounds the array.
      if (minute < 0 || minute >= bins.length) continue;
      bins[minute].count += 1;
      total += 1;
    }

    let peak = { minute: 0, count: 0 };
    for (const b of bins) {
      if (b.count > peak.count) {
        peak = { minute: b.minute, count: b.count };
      }
    }

    return NextResponse.json(
      { bins, total, peak },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  } catch (err) {
    console.error("comment-volume fetch error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to fetch comment volume" },
      { status: 502 },
    );
  }
}
