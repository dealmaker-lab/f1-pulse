import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openf1.org/v1";

/**
 * Check which sessions in a list have team radio data available.
 * Accepts comma-separated session_keys via query param.
 * Returns { available: number[] } — the session_keys that have radio.
 *
 * Note: OpenF1's team_radio endpoint breaks with `limit` param,
 * so we use driver_number=1 (Verstappen) to keep responses small.
 * If driver 1 isn't in the session, we fall back to fetching all.
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

  // Check each session for radio data
  // Use driver_number=1 (Verstappen) to keep response small — he's in every session 2023+
  // If that returns nothing, try without driver filter as fallback
  // Process in batches of 8 to avoid overwhelming OpenF1
  const BATCH_SIZE = 8;
  const available: number[] = [];

  for (let i = 0; i < sessionKeys.length; i += BATCH_SIZE) {
    const batch = sessionKeys.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (sk) => {
        try {
          // Try driver 1 first (Verstappen — lightweight check)
          const res = await fetch(
            `${BASE}/team_radio?session_key=${sk}&driver_number=1`,
            { cache: "no-store" }
          );
          if (!res.ok) return { sk, hasRadio: false };
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (Array.isArray(data) && data.length > 0) {
              return { sk, hasRadio: true };
            }
          } catch {
            // OpenF1 returns {"detail":"No results found."} as non-array
          }

          // Fallback: try without driver filter (in case driver 1 not in session)
          const res2 = await fetch(
            `${BASE}/team_radio?session_key=${sk}`,
            { cache: "no-store" }
          );
          if (!res2.ok) return { sk, hasRadio: false };
          const text2 = await res2.text();
          try {
            const data2 = JSON.parse(text2);
            return { sk, hasRadio: Array.isArray(data2) && data2.length > 0 };
          } catch {
            return { sk, hasRadio: false };
          }
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
      await new Promise((r) => setTimeout(r, 150));
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
