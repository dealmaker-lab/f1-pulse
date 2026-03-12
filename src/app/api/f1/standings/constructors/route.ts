import { NextRequest, NextResponse } from "next/server";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year") || "2026";

  try {
    const res = await fetch(`${JOLPICA_BASE}/${year}/constructorstandings/?format=json`, {
      next: { revalidate: 300 },
    });
    const json = await res.json();

    const standingsTable = json?.MRData?.StandingsTable?.StandingsLists?.[0];
    if (!standingsTable?.ConstructorStandings) {
      return NextResponse.json([]);
    }

    const standings = standingsTable.ConstructorStandings.map((s: any) => ({
      position: parseInt(s.position),
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
      team: s.Constructor?.name || "",
      constructorId: s.Constructor?.constructorId || "",
      teamColor: getTeamColor2026(s.Constructor?.constructorId || ""),
      nationality: s.Constructor?.nationality || "",
    }));

    return NextResponse.json(standings);
  } catch (err) {
    console.error("Failed to fetch constructor standings:", err);
    return NextResponse.json({ error: "Failed to fetch constructor standings" }, { status: 500 });
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
