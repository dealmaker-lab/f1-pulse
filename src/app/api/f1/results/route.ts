import { NextRequest, NextResponse } from "next/server";
import { JOLPICA_BASE, fetchAllRaces } from "@/lib/jolpica";

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year") || "2026";
  const round = req.nextUrl.searchParams.get("round"); // optional specific round

  try {
    let races;
    if (round) {
      const res = await fetch(
        `${JOLPICA_BASE}/${year}/${round}/results/?format=json`,
        { cache: "no-store" }
      );
      const json = await res.json();
      races = json?.MRData?.RaceTable?.Races || [];
    } else {
      races = await fetchAllRaces(
        `${JOLPICA_BASE}/${year}/results/?format=json`,
        "Results"
      );
    }

    const results = races.map((race: any) => ({
      round: parseInt(race.round),
      raceName: race.raceName,
      circuit: race.Circuit?.circuitName || "",
      country: race.Circuit?.Location?.country || "",
      date: race.date,
      results: (race.Results || []).map((r: any) => ({
        position: parseInt(r.position),
        driver: {
          code: r.Driver?.code || r.Driver?.familyName?.substring(0, 3).toUpperCase(),
          name: `${r.Driver?.givenName} ${r.Driver?.familyName}`,
          number: parseInt(r.Driver?.permanentNumber) || 0,
          nationality: r.Driver?.nationality || "",
          team: r.Constructor?.name || "",
          teamColor: getTeamColor2026(r.Constructor?.constructorId || ""),
        },
        points: parseFloat(r.points),
        grid: parseInt(r.grid),
        laps: parseInt(r.laps),
        status: r.status,
        time: r.Time?.time || null,
      })),
    }));

    return NextResponse.json(results);
  } catch (err) {
    console.error("Failed to fetch results:", err);
    return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 });
  }
}

function getTeamColor2026(constructorId: string): string {
  const colors: Record<string, string> = {
    mercedes: "#27F4D2",
    ferrari: "#E8002D",
    red_bull: "#3671C6",
    mclaren: "#FF8000",
    aston_martin: "#229971",
    alpine: "#FF87BC",
    williams: "#64C4FF",
    rb: "#6692FF",
    haas: "#B6BABD",
    sauber: "#52E252",
    audi: "#00E701",
    cadillac: "#1E3D6B",
    racing_bulls: "#6692FF",
  };
  return colors[constructorId] || "#888888";
}
