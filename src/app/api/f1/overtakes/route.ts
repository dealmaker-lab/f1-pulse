import { NextRequest, NextResponse } from "next/server";
import { validateSessionKey, sanitizeError } from "@/lib/api-validation";

const BASE = "https://api.openf1.org/v1";

interface OpenF1Overtake {
  date: string;
  session_key: number;
  meeting_key: number;
  overtaking_driver_number: number;
  overtaken_driver_number: number;
  position: number;
}

interface OpenF1Driver {
  driver_number: number;
  name_acronym: string;
  team_colour: string | null;
  team_name: string | null;
}

/**
 * On-track overtakes for a session (OpenF1 /v1/overtakes, stable since
 * 2026), joined with driver acronyms + team colours so the client renders
 * without a second request. Historical sessions never change → edge-cache.
 */
export async function GET(req: NextRequest) {
  const sessionKey = validateSessionKey(req.nextUrl.searchParams.get("session_key"));
  if (!sessionKey) {
    return NextResponse.json(
      { error: "Valid session_key (positive integer) required" },
      { status: 400 },
    );
  }

  try {
    const [overtakesRes, driversRes] = await Promise.all([
      fetch(`${BASE}/overtakes?session_key=${sessionKey}`, {
        next: { revalidate: 300 },
      }),
      fetch(`${BASE}/drivers?session_key=${sessionKey}`, {
        next: { revalidate: 3600 },
      }),
    ]);
    if (!overtakesRes.ok) {
      return NextResponse.json(
        { error: "Upstream API error" },
        { status: overtakesRes.status },
      );
    }

    const overtakes = (await overtakesRes.json()) as OpenF1Overtake[];
    const drivers = driversRes.ok
      ? ((await driversRes.json()) as OpenF1Driver[])
      : [];
    const byNumber = new Map(drivers.map((d) => [d.driver_number, d]));

    const enriched = (Array.isArray(overtakes) ? overtakes : [])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((o) => {
        const taker = byNumber.get(o.overtaking_driver_number);
        const taken = byNumber.get(o.overtaken_driver_number);
        return {
          date: o.date,
          position: o.position,
          overtaker: {
            number: o.overtaking_driver_number,
            code: taker?.name_acronym ?? `#${o.overtaking_driver_number}`,
            teamColor: taker?.team_colour ? `#${taker.team_colour}` : "#888888",
          },
          overtaken: {
            number: o.overtaken_driver_number,
            code: taken?.name_acronym ?? `#${o.overtaken_driver_number}`,
            teamColor: taken?.team_colour ? `#${taken.team_colour}` : "#888888",
          },
        };
      });

    return NextResponse.json(enriched, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("Overtakes fetch error:", sanitizeError(err));
    return NextResponse.json(
      { error: "Failed to fetch overtakes" },
      { status: 500 },
    );
  }
}
