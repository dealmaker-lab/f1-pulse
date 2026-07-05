import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, sanitizeError } from "@/lib/api-validation";
import { getTeamRadio } from "@/data/openf1";
import { auth } from "@clerk/nextjs/server";

// Each radio file individually exits to Whisper, so we want generous time.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUERY_LEN = 200;
const MAX_TRANSCRIPTIONS_PER_REQUEST = 20;

/** Permit letters, digits, spaces, and a small safe punctuation set.
 *  ASCII-only — \p{L}/\p{N} unicode classes require ES6 target which the
 *  project's tsconfig doesn't ship; F1 driver radio queries are English. */
const QUERY_PATTERN = /^[a-zA-Z0-9 '\-]+$/;

interface RadioRecord {
  driver_number: number;
  date: string;
  recording_url: string;
}

interface SearchResult {
  driver_number: number;
  date: string;
  recording_url: string;
  text: string;
  score: number;
}

/** Build an absolute URL to our own /api/radio/transcribe — required for
 *  server-to-server fetches inside route handlers. */
function getTranscribeUrl(req: NextRequest, recordingUrl: string): string {
  const origin = req.nextUrl.origin;
  return `${origin}/api/radio/transcribe?url=${encodeURIComponent(recordingUrl)}`;
}

export async function GET(req: NextRequest) {
  // Auth gate: each search fan-outs up to 20 paid Whisper calls.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  const rawQuery = req.nextUrl.searchParams.get("q") ?? "";
  const query = rawQuery.trim();

  if (!sessionKey) {
    return NextResponse.json(
      { error: "Valid session_key required" },
      { status: 400 },
    );
  }
  if (!query) {
    return NextResponse.json(
      { error: "Query (q) required" },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY_LEN) {
    return NextResponse.json(
      { error: `Query too long (max ${MAX_QUERY_LEN} chars)` },
      { status: 400 },
    );
  }
  if (!QUERY_PATTERN.test(query)) {
    return NextResponse.json(
      { error: "Query contains invalid characters" },
      { status: 400 },
    );
  }

  // Pre-flight env check — fail fast with the same 503 the transcribe route uses
  // so the UI can show a single consistent "not configured" state.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Transcription not configured" },
      { status: 503 },
    );
  }

  try {
    const radioRaw = await getTeamRadio(sessionKey);
    // getTeamRadio returns unknown[]; we narrow to RadioRecord[] via the
    // structural cast since OpenF1's contract is stable.
    const allRadio: RadioRecord[] = Array.isArray(radioRaw)
      ? (radioRaw as RadioRecord[])
      : [];
    const totalRadios = allRadio.length;

    // Cost cap: at most N transcriptions per request. Newest first so the
    // user sees the most recent radio surfaced first.
    const sorted = [...allRadio].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const toSearch = sorted.slice(0, MAX_TRANSCRIPTIONS_PER_REQUEST);
    const remaining = Math.max(0, totalRadios - toSearch.length);

    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    // Run transcriptions in parallel — the route handler already caches each
    // url in memory, so warm instances respond instantly. Cold instances take
    // the full ~Whisper-latency hit, which is why we cap at 20.
    // Forward the caller's cookies — /api/radio/transcribe sits behind the
    // same Clerk gate (and Vercel deployment protection); a bare
    // server-to-server fetch 401s and every search silently returned zero.
    const cookie = req.headers.get("cookie") ?? "";
    const transcriptions = await Promise.all(
      toSearch.map(async (r) => {
        try {
          const res = await fetch(getTranscribeUrl(req, r.recording_url), {
            cache: "no-store",
            headers: cookie ? { cookie } : undefined,
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { text?: string };
          return { record: r, text: (data.text ?? "").trim() };
        } catch {
          return null;
        }
      }),
    );

    for (const item of transcriptions) {
      if (!item || !item.text) continue;
      const lowerText = item.text.toLowerCase();
      if (!lowerText.includes(lowerQuery)) continue;

      // Exact-word match (bounded by spaces or string edges) scores higher
      // than a plain substring (e.g., "box" inside "boxing"). Cheap heuristic
      // so users searching "box" rank "box box box" above "boxing this lap".
      const exactPattern = new RegExp(
        `(^|\\s)${escapeRegex(lowerQuery)}(\\s|$|[.,!?])`,
      );
      const score = exactPattern.test(lowerText) ? 1 : 0.7;

      results.push({
        driver_number: item.record.driver_number,
        date: item.record.date,
        recording_url: item.record.recording_url,
        text: item.text,
        score,
      });
    }

    results.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));

    return NextResponse.json({
      results,
      count: results.length,
      total_searched: toSearch.length,
      total_available: totalRadios,
      remaining,
    });
  } catch (err) {
    console.error("[radio-search] error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 },
    );
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
