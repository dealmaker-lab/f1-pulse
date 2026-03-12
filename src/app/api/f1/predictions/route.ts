import { NextRequest, NextResponse } from "next/server";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

interface DriverPerformance {
  code: string;
  name: string;
  team: string;
  teamColor: string;
  // Scoring factors
  recentForm: number;         // Avg points last 5 races (0-25)
  circuitHistory: number;     // Avg finish position at this circuit (lower = better)
  qualifyingPace: number;     // Avg qualifying position (lower = better)
  teamStrength: number;       // Constructor standing position (lower = better)
  consistency: number;        // Std dev of finishes (lower = better)
  // Final scores
  qualifyingScore: number;
  raceScore: number;
  confidence: number;
}

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year") || "2026";
  const circuit = req.nextUrl.searchParams.get("circuit") || "";

  try {
    // Fetch data in parallel for speed
    const [currentStandings, constructorStandings, currentResults, prevYear1, prevYear2, prevYear3] = await Promise.all([
      fetchJSON(`${JOLPICA_BASE}/${year}/driverstandings/?format=json`),
      fetchJSON(`${JOLPICA_BASE}/${year}/constructorstandings/?format=json`),
      fetchJSON(`${JOLPICA_BASE}/${year}/results/?format=json&limit=1000`),
      fetchJSON(`${JOLPICA_BASE}/${parseInt(year) - 1}/results/?format=json&limit=1000`),
      fetchJSON(`${JOLPICA_BASE}/${parseInt(year) - 2}/results/?format=json&limit=1000`),
      fetchJSON(`${JOLPICA_BASE}/${parseInt(year) - 3}/results/?format=json&limit=1000`),
    ]);

    const driverStandings = currentStandings?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
    const constStandings = constructorStandings?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];

    // Build constructor rank map
    const constructorRank: Record<string, number> = {};
    constStandings.forEach((c: any) => {
      constructorRank[c.Constructor?.constructorId] = parseInt(c.position);
    });

    // Gather all race results from current + previous 3 years
    const allResults = [
      ...(currentResults?.MRData?.RaceTable?.Races || []),
      ...(prevYear1?.MRData?.RaceTable?.Races || []),
      ...(prevYear2?.MRData?.RaceTable?.Races || []),
      ...(prevYear3?.MRData?.RaceTable?.Races || []),
    ];

    // Get current grid drivers from standings or latest race
    const currentDrivers = new Map<string, { name: string; team: string; constructorId: string }>();

    if (driverStandings.length > 0) {
      driverStandings.forEach((s: any) => {
        const code = s.Driver?.code || s.Driver?.familyName?.substring(0, 3).toUpperCase();
        currentDrivers.set(code, {
          name: `${s.Driver?.givenName} ${s.Driver?.familyName}`,
          team: s.Constructors?.[0]?.name || "",
          constructorId: s.Constructors?.[0]?.constructorId || "",
        });
      });
    } else {
      // Fallback: get drivers from previous year's last standings
      const prevStandings = prevYear1?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
      prevStandings.forEach((s: any) => {
        const code = s.Driver?.code || s.Driver?.familyName?.substring(0, 3).toUpperCase();
        currentDrivers.set(code, {
          name: `${s.Driver?.givenName} ${s.Driver?.familyName}`,
          team: s.Constructors?.[0]?.name || "",
          constructorId: s.Constructors?.[0]?.constructorId || "",
        });
      });
    }

    // Compute performance metrics per driver
    const performances: DriverPerformance[] = [];

    for (const [code, info] of Array.from(currentDrivers.entries())) {
      // Get all results for this driver
      const driverResults: { position: number; grid: number; points: number; circuitId: string; year: number }[] = [];

      allResults.forEach((race: any) => {
        (race.Results || []).forEach((r: any) => {
          const dCode = r.Driver?.code || r.Driver?.familyName?.substring(0, 3).toUpperCase();
          if (dCode === code) {
            driverResults.push({
              position: parseInt(r.position) || 20,
              grid: parseInt(r.grid) || 20,
              points: parseFloat(r.points) || 0,
              circuitId: race.Circuit?.circuitId || "",
              year: parseInt(race.season),
            });
          }
        });
      });

      if (driverResults.length === 0) continue;

      // 1. Recent form: average points in last 5 races
      const recent = driverResults
        .sort((a, b) => b.year - a.year)
        .slice(0, 5);
      const recentForm = recent.reduce((sum, r) => sum + r.points, 0) / recent.length;

      // 2. Circuit history: avg finish at target circuit
      const circuitResults = circuit
        ? driverResults.filter((r) => r.circuitId === circuit)
        : [];
      const circuitHistory = circuitResults.length > 0
        ? circuitResults.reduce((sum, r) => sum + r.position, 0) / circuitResults.length
        : 10; // default mid-pack if no history

      // 3. Qualifying pace: avg grid position across recent races
      const qualifyingPace = recent.reduce((sum, r) => sum + r.grid, 0) / recent.length;

      // 4. Team strength from constructor standings
      const teamStrength = constructorRank[info.constructorId] || 6;

      // 5. Consistency: standard deviation of finishing positions
      const positions = driverResults.slice(0, 10).map((r) => r.position);
      const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
      const variance = positions.reduce((a, b) => a + (b - mean) ** 2, 0) / positions.length;
      const consistency = Math.sqrt(variance);

      // Calculate composite scores
      // Qualifying prediction (grid matters most)
      const qualifyingScore =
        (25 - qualifyingPace) * 0.35 +      // recent qualifying pace
        recentForm * 0.25 +                   // current form
        (11 - teamStrength) * 1.5 * 0.20 +   // team performance
        (20 - circuitHistory) * 0.20;         // circuit familiarity

      // Race prediction (race pace + strategy + consistency)
      const raceScore =
        recentForm * 0.30 +                   // race results form
        (25 - qualifyingPace) * 0.20 +        // qualifying position affects race
        (11 - teamStrength) * 1.5 * 0.20 +   // team strength
        (20 - circuitHistory) * 0.15 +        // circuit knowledge
        (10 - consistency) * 0.15;            // consistency bonus

      // Confidence based on data availability
      const dataPoints = driverResults.length;
      const confidence = Math.min(95, Math.max(40, 40 + dataPoints * 3 + (circuitResults.length > 0 ? 15 : 0)));

      performances.push({
        code,
        name: info.name,
        team: info.team,
        teamColor: getTeamColor2026(info.constructorId),
        recentForm,
        circuitHistory,
        qualifyingPace,
        teamStrength,
        consistency,
        qualifyingScore,
        raceScore,
        confidence,
      });
    }

    // Sort by scores
    const qualifyingPrediction = [...performances]
      .sort((a, b) => b.qualifyingScore - a.qualifyingScore)
      .map((p, i) => ({ ...p, predictedPosition: i + 1 }));

    const racePrediction = [...performances]
      .sort((a, b) => b.raceScore - a.raceScore)
      .map((p, i) => ({ ...p, predictedPosition: i + 1 }));

    // Calculate points factors breakdown for top 5
    const factors = qualifyingPrediction.slice(0, 5).map((p) => ({
      code: p.code,
      factors: {
        recentForm: Math.round(p.recentForm * 10) / 10,
        circuitHistory: Math.round(p.circuitHistory * 10) / 10,
        qualifyingPace: Math.round(p.qualifyingPace * 10) / 10,
        teamStrength: p.teamStrength,
        consistency: Math.round(p.consistency * 10) / 10,
      },
    }));

    return NextResponse.json({
      qualifying: qualifyingPrediction.slice(0, 20),
      race: racePrediction.slice(0, 20),
      factors,
      dataYears: [parseInt(year), parseInt(year) - 1, parseInt(year) - 2, parseInt(year) - 3],
      totalDataPoints: allResults.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Prediction error:", err);
    return NextResponse.json({ error: "Failed to generate predictions" }, { status: 500 });
  }
}

async function fetchJSON(url: string) {
  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    return res.json();
  } catch {
    return {};
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
  };
  return colors[constructorId] || "#888888";
}
