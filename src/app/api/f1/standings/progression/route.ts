import { NextRequest, NextResponse } from "next/server";
import { JOLPICA_BASE, fetchAllRaces } from "@/lib/jolpica";

// Returns round-by-round championship progression for all drivers
export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year") || "2026";

  try {
    // Fetch all results + sprints with pagination. Sprint points are part
    // of the championship — omitting them made these curves disagree with
    // the official standings shown elsewhere in the app.
    const [races, sprintRaces] = await Promise.all([
      fetchAllRaces(`${JOLPICA_BASE}/${year}/results/?format=json`, "Results"),
      fetchAllRaces(`${JOLPICA_BASE}/${year}/sprint/?format=json`, "SprintResults").catch(
        () => [] as Awaited<ReturnType<typeof fetchAllRaces>>,
      ),
    ]);

    if (races.length === 0) {
      return NextResponse.json({ raceNames: [], drivers: [] });
    }

    const sprintPtsByRound = new Map<string, Map<string, number>>();
    for (const sr of sprintRaces) {
      const m = new Map<string, number>();
      for (const res of sr.SprintResults || []) {
        const code =
          res.Driver?.code || res.Driver?.familyName?.substring(0, 3).toUpperCase();
        if (code) m.set(code, parseFloat(res.points) || 0);
      }
      sprintPtsByRound.set(String(sr.round), m);
    }

    const raceNames: string[] = [];
    const driverCumulative: Record<string, { points: number[]; team: string; teamColor: string; name: string }> = {};

    races.forEach((race: any, raceIdx: number) => {
      raceNames.push(race.raceName || `Round ${race.round}`);

      // Process each driver's result (+ sprint points from the same round)
      const roundSprints = sprintPtsByRound.get(String(race.round));
      (race.Results || []).forEach((r: any) => {
        const code = r.Driver?.code || r.Driver?.familyName?.substring(0, 3).toUpperCase();
        const pts = (parseFloat(r.points) || 0) + (roundSprints?.get(code) ?? 0);

        if (!driverCumulative[code]) {
          driverCumulative[code] = {
            points: new Array(raceIdx).fill(0),
            team: r.Constructor?.name || "",
            teamColor: getTeamColor2026(r.Constructor?.constructorId || ""),
            name: `${r.Driver?.givenName} ${r.Driver?.familyName}`,
          };
        }

        // Ensure array is long enough
        while (driverCumulative[code].points.length < raceIdx) {
          const lastVal = driverCumulative[code].points.length > 0
            ? driverCumulative[code].points[driverCumulative[code].points.length - 1]
            : 0;
          driverCumulative[code].points.push(lastVal);
        }

        const prevPts = raceIdx > 0
          ? (driverCumulative[code].points[raceIdx - 1] || 0)
          : 0;
        driverCumulative[code].points[raceIdx] = prevPts + pts;
      });

      // Fill forward drivers who didn't race this round
      Object.keys(driverCumulative).forEach((code) => {
        if (driverCumulative[code].points.length <= raceIdx) {
          const lastVal = driverCumulative[code].points.length > 0
            ? driverCumulative[code].points[driverCumulative[code].points.length - 1]
            : 0;
          driverCumulative[code].points.push(lastVal);
        }
      });
    });

    // Sort by final points and return top 10
    const sorted = Object.entries(driverCumulative)
      .sort(([, a], [, b]) => {
        const lastA = a.points[a.points.length - 1] || 0;
        const lastB = b.points[b.points.length - 1] || 0;
        return lastB - lastA;
      })
      .slice(0, 10);

    const drivers = sorted.map(([code, data], idx) => ({
      code,
      name: data.name,
      team: data.team,
      teamColor: data.teamColor,
      points: data.points[data.points.length - 1] || 0,
      pointsHistory: data.points,
      position: idx + 1,
    }));

    return NextResponse.json({ raceNames, drivers });
  } catch (err) {
    console.error("Failed to fetch progression:", err);
    return NextResponse.json({ error: "Failed to fetch progression" }, { status: 500 });
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
    racing_point: "#F596C8",
    renault: "#FFF500",
    alphatauri: "#6692FF",
    alfa: "#C92D4B",
    toro_rosso: "#469BFF",
  };
  return colors[constructorId] || "#888888";
}
