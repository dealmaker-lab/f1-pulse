import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openf1.org/v1";

/**
 * Check which sessions in a list have team radio data available.
 * Accepts comma-separated session_keys via query param.
 * Returns { available: number[] } — the session_keys that have radio.
 */
export async function GET(req: NextRequest) {
  const keysParam = req.nextUrl.searchParams.get("session_keys");
  if (!keysParam) {
    return NextResponse.json(
      { error: "session_keys required (comma-separated)" },
      { status: 400 }
    );
  }

  const sessionKeys = keysParam
    .split(",")
    .map((k) => parseInt(k.trim(), 10))
    .filter((k) => !isNaN(k));

  if (sessionKeys.length === 0) {
    return NextResponse.json({ available: [] });
  }

  // Check each session for radio data with limit=1 (lightweight)
  // Process in batches of 10 to avoid overwhelming OpenF1
  const BATCH_SIZE = 10;
  const available: number[] = [];

  for (let i = 0; i < sessionKeys.length; i += BATCH_SIZE) {
    const batch = sessionKeys.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (sk) => {
        try {
          const res = await fetch(
            `${BASE}/team_radio?session_key=${sk}&limit=1`,
            { cache: "no-store" }
          );
          if (!res.ok) return { sk, hasRadio: false };
          const data = await res.json();
          return { sk, hasRadio: Array.isArray(data) && data.length > 0 };
        } catch {
          return { sk, hasRadio: false };
        }
      })
    );

    for (const r of results) {
      if (r.hasRadio) available.push(r.sk);
    }

    // Small delay between batches to be kind to OpenF1
    if (i + BATCH_SIZE < sessionKeys.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return NextResponse.json(
    { available },
    {
      headers: {
        // Cache for 1 hour — radio availability doesn't change often
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    }
  );
}
