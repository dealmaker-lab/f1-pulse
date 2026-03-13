import { NextRequest, NextResponse } from "next/server";
import { JOLPICA_BASE, fetchAllRaces } from "@/lib/jolpica";
import { validateYear, validateDriverCode, sanitizeError } from "@/lib/api-validation";

interface DriverResult {
  code: string;
  name: string;
  team: string;
  teamColor: string;
  position: number;
  grid: number;
  points: number;
  status: string;
  time: string | null;
}

interface RaceH2H {
  round: number;
  raceName: string;
  circuit: string;
  country: string;
  date: string;
  driver1: DriverResult | null;
  driver2: DriverResult | null;
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

function driverCode(d: any): string {
  return d?.code || d?.familyName?.substring(0, 3).toUpperCase() || "???";
}

function parseDriver(r: any): DriverResult {
  return {
    code: driverCode(r.Driver),
    name: `${r.Driver?.givenName || ""} ${r.Driver?.familyName || ""}`.trim(),
    team: r.Constructor?.name || "",
    teamColor: getTeamColor2026(r.Constructor?.constructorId || ""),
    position: parseInt(r.position),
    grid: parseInt(r.grid) || 0,
    points: parseFloat(r.points) || 0,
    status: r.status || "",
    time: r.Time?.time || null,
  };
}

export async function GET(req: NextRequest) {
  const year = validateYear(req.nextUrl.searchParams.get("year"), 2025);
  const d1 = validateDriverCode(req.nextUrl.searchParams.get("d1"));
  const d2 = validateDriverCode(req.nextUrl.searchParams.get("d2"));

  if (!d1 || !d2) {
    return NextResponse.json({ error: "Valid d1 and d2 driver codes required (2-4 uppercase letters)" }, { status: 400 });
  }

  try {
    // Fetch all race results + qualifying for the year (with pagination)
    const [races, qualifyingRaces, standingsRes] = await Promise.all([
      fetchAllRaces(`${JOLPICA_BASE}/${String(year)}/results/?format=json`, "Results"),
      fetchAllRaces(`${JOLPICA_BASE}/${String(year)}/qualifying/?format=json`, "QualifyingResults"),
      fetch(`${JOLPICA_BASE}/${String(year)}/driverstandings/?format=json`, { cache: "no-store" }),
    ]);

    const standingsJson = await standingsRes.json();
    const allStandings = standingsJson?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];

    // Build race-by-race H2H
    const raceH2H: RaceH2H[] = [];
    let d1Wins = 0, d2Wins = 0;
    let d1Points = 0, d2Points = 0;
    let d1Podiums = 0, d2Podiums = 0;
    let d1DNFs = 0, d2DNFs = 0;
    let d1BestFinish = 99, d2BestFinish = 99;
    let d1AvgFinish = 0, d2AvgFinish = 0;
    let d1RaceCount = 0, d2RaceCount = 0;
    let d1PointsHistory: number[] = [];
    let d2PointsHistory: number[] = [];
    let d1RunningPoints = 0, d2RunningPoints = 0;
    let d1AheadRace = 0, d2AheadRace = 0;

    for (const race of races) {
      const results = race.Results || [];
      const r1 = results.find((r: any) => driverCode(r.Driver) === d1);
      const r2 = results.find((r: any) => driverCode(r.Driver) === d2);

      const dr1 = r1 ? parseDriver(r1) : null;
      const dr2 = r2 ? parseDriver(r2) : null;

      raceH2H.push({
        round: parseInt(race.round),
        raceName: race.raceName,
        circuit: race.Circuit?.circuitName || "",
        country: race.Circuit?.Location?.country || "",
        date: race.date,
        driver1: dr1,
        driver2: dr2,
      });

      // Accumulate stats
      if (dr1) {
        d1Points += dr1.points;
        d1RunningPoints += dr1.points;
        if (dr1.position <= 3) d1Podiums++;
        if (dr1.position === 1) d1Wins++;
        if (dr1.status !== "Finished" && !dr1.status.startsWith("+")) d1DNFs++;
        if (dr1.position < d1BestFinish) d1BestFinish = dr1.position;
        d1AvgFinish += dr1.position;
        d1RaceCount++;
      }
      if (dr2) {
        d2Points += dr2.points;
        d2RunningPoints += dr2.points;
        if (dr2.position <= 3) d2Podiums++;
        if (dr2.position === 1) d2Wins++;
        if (dr2.status !== "Finished" && !dr2.status.startsWith("+")) d2DNFs++;
        if (dr2.position < d2BestFinish) d2BestFinish = dr2.position;
        d2AvgFinish += dr2.position;
        d2RaceCount++;
      }

      // Race H2H (who finished ahead)
      if (dr1 && dr2) {
        if (dr1.position < dr2.position) d1AheadRace++;
        else if (dr2.position < dr1.position) d2AheadRace++;
      }

      d1PointsHistory.push(d1RunningPoints);
      d2PointsHistory.push(d2RunningPoints);
    }

    // Build qualifying H2H
    let d1AheadQuali = 0, d2AheadQuali = 0;
    let d1AvgQuali = 0, d2AvgQuali = 0;
    let d1QualiCount = 0, d2QualiCount = 0;
    let d1Poles = 0, d2Poles = 0;
    const qualiGaps: { round: number; raceName: string; d1Pos: number; d2Pos: number; gap: number }[] = [];

    for (const qRace of qualifyingRaces) {
      const qResults = qRace.QualifyingResults || [];
      const q1 = qResults.find((r: any) => driverCode(r.Driver) === d1);
      const q2 = qResults.find((r: any) => driverCode(r.Driver) === d2);

      if (q1 && q2) {
        const p1 = parseInt(q1.position);
        const p2 = parseInt(q2.position);
        if (p1 < p2) d1AheadQuali++;
        else if (p2 < p1) d2AheadQuali++;

        d1AvgQuali += p1;
        d2AvgQuali += p2;
        d1QualiCount++;
        d2QualiCount++;

        if (p1 === 1) d1Poles++;
        if (p2 === 1) d2Poles++;

        qualiGaps.push({
          round: parseInt(qRace.round),
          raceName: qRace.raceName,
          d1Pos: p1,
          d2Pos: p2,
          gap: p1 - p2, // negative = d1 ahead
        });
      }
    }

    // Get full driver info from standings
    const s1 = allStandings.find((s: any) => driverCode(s.Driver) === d1);
    const s2 = allStandings.find((s: any) => driverCode(s.Driver) === d2);

    const driver1Info = s1 ? {
      code: d1,
      name: `${s1.Driver?.givenName} ${s1.Driver?.familyName}`,
      number: parseInt(s1.Driver?.permanentNumber) || 0,
      nationality: s1.Driver?.nationality || "",
      team: s1.Constructors?.[0]?.name || "",
      teamColor: getTeamColor2026(s1.Constructors?.[0]?.constructorId || ""),
      championshipPos: parseInt(s1.position),
    } : null;

    const driver2Info = s2 ? {
      code: d2,
      name: `${s2.Driver?.givenName} ${s2.Driver?.familyName}`,
      number: parseInt(s2.Driver?.permanentNumber) || 0,
      nationality: s2.Driver?.nationality || "",
      team: s2.Constructors?.[0]?.name || "",
      teamColor: getTeamColor2026(s2.Constructors?.[0]?.constructorId || ""),
      championshipPos: parseInt(s2.position),
    } : null;

    return NextResponse.json({
      year: parseInt(year),
      driver1: driver1Info,
      driver2: driver2Info,
      raceH2H,
      stats: {
        points: { d1: d1Points, d2: d2Points },
        wins: { d1: d1Wins, d2: d2Wins },
        podiums: { d1: d1Podiums, d2: d2Podiums },
        poles: { d1: d1Poles, d2: d2Poles },
        dnfs: { d1: d1DNFs, d2: d2DNFs },
        bestFinish: { d1: d1BestFinish === 99 ? null : d1BestFinish, d2: d2BestFinish === 99 ? null : d2BestFinish },
        avgFinish: {
          d1: d1RaceCount > 0 ? +(d1AvgFinish / d1RaceCount).toFixed(1) : null,
          d2: d2RaceCount > 0 ? +(d2AvgFinish / d2RaceCount).toFixed(1) : null,
        },
        avgQuali: {
          d1: d1QualiCount > 0 ? +(d1AvgQuali / d1QualiCount).toFixed(1) : null,
          d2: d2QualiCount > 0 ? +(d2AvgQuali / d2QualiCount).toFixed(1) : null,
        },
        raceH2H: { d1: d1AheadRace, d2: d2AheadRace },
        qualiH2H: { d1: d1AheadQuali, d2: d2AheadQuali },
      },
      pointsProgression: {
        raceNames: raceH2H.map((r) => r.raceName.replace(" Grand Prix", " GP")),
        d1: d1PointsHistory,
        d2: d2PointsHistory,
      },
      qualiGaps,
    });
  } catch (err) {
    console.error("H2H fetch error:", sanitizeError(err));
    return NextResponse.json({ error: "Failed to fetch H2H data" }, { status: 500 });
  }
}
