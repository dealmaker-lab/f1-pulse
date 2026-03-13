import { NextRequest, NextResponse } from "next/server";
import { JOLPICA_BASE } from "@/lib/jolpica";

/**
 * Career H2H API — aggregates head-to-head stats across ALL seasons where
 * both drivers competed. Uses Jolpica/Ergast which has data back to 1950.
 *
 * Optimized: uses per-driver result endpoints to minimize API calls.
 *
 * Query params:
 *   d1 - driver code or driverId (e.g. "VER" or "max_verstappen")
 *   d2 - driver code or driverId (e.g. "HAM" or "hamilton")
 *   startYear (optional) - start of year range
 *   endYear (optional) - end of year range
 */

function driverCode(d: any): string {
  return d?.code || d?.familyName?.substring(0, 3).toUpperCase() || "???";
}

interface SeasonSummary {
  year: number;
  d1Points: number;
  d2Points: number;
  d1Wins: number;
  d2Wins: number;
  d1AheadRace: number;
  d2AheadRace: number;
  racesCompared: number;
  d1Team: string;
  d2Team: string;
}

/**
 * Resolve a 3-letter driver code (e.g. "VER") to a Jolpica driverId (e.g. "max_verstappen").
 * If the input already looks like a driverId, return as-is.
 */
async function resolveDriverId(codeOrId: string): Promise<string> {
  // Already a driverId (lowercase, longer than 3 chars or contains underscore)
  if (codeOrId.length > 3 || codeOrId.includes("_") || codeOrId === codeOrId.toLowerCase()) {
    return codeOrId;
  }

  // It's a 3-letter code — search recent seasons for the mapping
  const currentYear = new Date().getFullYear();
  // Fetch two years in parallel for speed
  const fetches = [currentYear, currentYear - 1, currentYear - 2].map(async (year) => {
    try {
      const res = await fetch(`${JOLPICA_BASE}/${year}/drivers.json?limit=50`, { cache: "no-store" });
      const data = await res.json();
      return data?.MRData?.DriverTable?.Drivers || [];
    } catch {
      return [];
    }
  });

  const results = await Promise.all(fetches);
  for (const drivers of results) {
    const match = drivers.find((d: any) => d.code === codeOrId.toUpperCase());
    if (match) return match.driverId;
  }

  return codeOrId.toLowerCase();
}

/**
 * Fetch all race results for a specific driver in a specific season.
 * Returns an array of race objects with the driver's result.
 * Uses per-driver endpoint — returns ~20-24 results in a single call (no pagination needed).
 */
async function fetchDriverSeasonResults(driverId: string, year: number): Promise<any[]> {
  const res = await fetch(
    `${JOLPICA_BASE}/${year}/drivers/${driverId}/results.json?limit=100`,
    { cache: "no-store" }
  );
  const data = await res.json();
  return data?.MRData?.RaceTable?.Races || [];
}

/**
 * Fetch all qualifying results for a specific driver in a specific season.
 */
async function fetchDriverSeasonQualifying(driverId: string, year: number): Promise<any[]> {
  const res = await fetch(
    `${JOLPICA_BASE}/${year}/drivers/${driverId}/qualifying.json?limit=100`,
    { cache: "no-store" }
  );
  const data = await res.json();
  return data?.MRData?.RaceTable?.Races || [];
}

export async function GET(req: NextRequest) {
  const d1 = req.nextUrl.searchParams.get("d1");
  const d2 = req.nextUrl.searchParams.get("d2");
  const startYear = parseInt(req.nextUrl.searchParams.get("startYear") || "1950");
  const endYear = parseInt(req.nextUrl.searchParams.get("endYear") || String(new Date().getFullYear()));

  if (!d1 || !d2) {
    return NextResponse.json({ error: "d1 and d2 driver codes required" }, { status: 400 });
  }

  try {
    // Resolve 3-letter codes to Jolpica driverIds
    const [d1Id, d2Id] = await Promise.all([
      resolveDriverId(d1),
      resolveDriverId(d2),
    ]);

    console.log(`Career H2H: resolved ${d1} → ${d1Id}, ${d2} → ${d2Id}`);

    // Find all seasons where BOTH drivers competed
    const [d1SeasonsRes, d2SeasonsRes] = await Promise.all([
      fetch(`${JOLPICA_BASE}/drivers/${d1Id}/seasons.json?limit=100`),
      fetch(`${JOLPICA_BASE}/drivers/${d2Id}/seasons.json?limit=100`),
    ]);

    const d1SeasonsJson = await d1SeasonsRes.json();
    const d2SeasonsJson = await d2SeasonsRes.json();

    console.log(`Seasons response: d1 total=${d1SeasonsJson?.MRData?.total}, d2 total=${d2SeasonsJson?.MRData?.total}`);

    const d1Seasons = new Set<number>(
      (d1SeasonsJson?.MRData?.SeasonTable?.Seasons || [])
        .map((s: any) => parseInt(s.season))
        .filter((y: number) => y >= startYear && y <= endYear)
    );
    const d2Seasons = new Set<number>(
      (d2SeasonsJson?.MRData?.SeasonTable?.Seasons || [])
        .map((s: any) => parseInt(s.season))
        .filter((y: number) => y >= startYear && y <= endYear)
    );

    const commonSeasons = Array.from(d1Seasons)
      .filter((y) => d2Seasons.has(y))
      .sort((a: number, b: number) => a - b) as number[];

    if (commonSeasons.length === 0) {
      return NextResponse.json({
        error: "No common seasons found between these drivers",
        d1Seasons: Array.from(d1Seasons).sort(),
        d2Seasons: Array.from(d2Seasons).sort(),
      });
    }

    // Aggregate stats across all common seasons
    let totalD1Points = 0, totalD2Points = 0;
    let totalD1Wins = 0, totalD2Wins = 0;
    let totalD1Podiums = 0, totalD2Podiums = 0;
    let totalD1Poles = 0, totalD2Poles = 0;
    let totalD1DNFs = 0, totalD2DNFs = 0;
    let totalD1AheadRace = 0, totalD2AheadRace = 0;
    let totalD1AheadQuali = 0, totalD2AheadQuali = 0;
    let totalRaces = 0;
    let d1BestFinish = 99, d2BestFinish = 99;
    let d1FinishSum = 0, d2FinishSum = 0;
    let d1FinishCount = 0, d2FinishCount = 0;

    const seasonSummaries: SeasonSummary[] = [];
    const yearlyPoints: { year: number; d1: number; d2: number }[] = [];

    // Process seasons in batches — each season needs 4 API calls (2 drivers × race + quali)
    const batchSize = 3;
    for (let i = 0; i < commonSeasons.length; i += batchSize) {
      const batch = commonSeasons.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (year) => {
          const [d1Races, d2Races, d1Quali, d2Quali] = await Promise.all([
            fetchDriverSeasonResults(d1Id, year),
            fetchDriverSeasonResults(d2Id, year),
            fetchDriverSeasonQualifying(d1Id, year).catch(() => []),
            fetchDriverSeasonQualifying(d2Id, year).catch(() => []),
          ]);
          return { year, d1Races, d2Races, d1Quali, d2Quali };
        })
      );

      for (const { year, d1Races, d2Races, d1Quali, d2Quali } of batchResults) {
        let seasonD1Points = 0, seasonD2Points = 0;
        let seasonD1Wins = 0, seasonD2Wins = 0;
        let seasonD1AheadRace = 0, seasonD2AheadRace = 0;
        let seasonRaces = 0;
        let seasonD1Team = "", seasonD2Team = "";

        // Build lookup maps by round
        const d1ByRound = new Map<string, any>();
        const d2ByRound = new Map<string, any>();

        for (const race of d1Races) {
          const r = race.Results?.[0];
          if (r) d1ByRound.set(race.round, r);
        }
        for (const race of d2Races) {
          const r = race.Results?.[0];
          if (r) d2ByRound.set(race.round, r);
        }

        // Process race results
        const allRounds = Array.from(new Set([...Array.from(d1ByRound.keys()), ...Array.from(d2ByRound.keys())]));
        for (const round of allRounds) {
          const r1 = d1ByRound.get(round);
          const r2 = d2ByRound.get(round);

          if (r1) {
            const pos = parseInt(r1.position);
            const pts = parseFloat(r1.points) || 0;
            seasonD1Points += pts;
            totalD1Points += pts;
            if (pos === 1) { totalD1Wins++; seasonD1Wins++; }
            if (pos <= 3) totalD1Podiums++;
            if (r1.status !== "Finished" && !r1.status?.startsWith("+")) totalD1DNFs++;
            if (pos < d1BestFinish) d1BestFinish = pos;
            d1FinishSum += pos;
            d1FinishCount++;
            if (!seasonD1Team) seasonD1Team = r1.Constructor?.name || "";
          }
          if (r2) {
            const pos = parseInt(r2.position);
            const pts = parseFloat(r2.points) || 0;
            seasonD2Points += pts;
            totalD2Points += pts;
            if (pos === 1) { totalD2Wins++; seasonD2Wins++; }
            if (pos <= 3) totalD2Podiums++;
            if (r2.status !== "Finished" && !r2.status?.startsWith("+")) totalD2DNFs++;
            if (pos < d2BestFinish) d2BestFinish = pos;
            d2FinishSum += pos;
            d2FinishCount++;
            if (!seasonD2Team) seasonD2Team = r2.Constructor?.name || "";
          }

          if (r1 && r2) {
            const p1 = parseInt(r1.position);
            const p2 = parseInt(r2.position);
            if (p1 < p2) { totalD1AheadRace++; seasonD1AheadRace++; }
            else if (p2 < p1) { totalD2AheadRace++; seasonD2AheadRace++; }
            seasonRaces++;
            totalRaces++;
          }
        }

        // Qualifying
        const d1QByRound = new Map<string, any>();
        const d2QByRound = new Map<string, any>();
        for (const race of d1Quali) {
          const q = race.QualifyingResults?.[0];
          if (q) d1QByRound.set(race.round, q);
        }
        for (const race of d2Quali) {
          const q = race.QualifyingResults?.[0];
          if (q) d2QByRound.set(race.round, q);
        }

        const allQRounds = Array.from(new Set([...Array.from(d1QByRound.keys()), ...Array.from(d2QByRound.keys())]));
        for (const round of allQRounds) {
          const q1 = d1QByRound.get(round);
          const q2 = d2QByRound.get(round);
          if (q1 && q2) {
            const p1 = parseInt(q1.position);
            const p2 = parseInt(q2.position);
            if (p1 < p2) totalD1AheadQuali++;
            else if (p2 < p1) totalD2AheadQuali++;
            if (p1 === 1) totalD1Poles++;
            if (p2 === 1) totalD2Poles++;
          }
        }

        seasonSummaries.push({
          year,
          d1Points: seasonD1Points,
          d2Points: seasonD2Points,
          d1Wins: seasonD1Wins,
          d2Wins: seasonD2Wins,
          d1AheadRace: seasonD1AheadRace,
          d2AheadRace: seasonD2AheadRace,
          racesCompared: seasonRaces,
          d1Team: seasonD1Team,
          d2Team: seasonD2Team,
        });

        yearlyPoints.push({ year, d1: seasonD1Points, d2: seasonD2Points });
      }
    }

    return NextResponse.json({
      d1Code: d1,
      d2Code: d2,
      commonSeasons,
      totalRaces,
      stats: {
        points: { d1: totalD1Points, d2: totalD2Points },
        wins: { d1: totalD1Wins, d2: totalD2Wins },
        podiums: { d1: totalD1Podiums, d2: totalD2Podiums },
        poles: { d1: totalD1Poles, d2: totalD2Poles },
        dnfs: { d1: totalD1DNFs, d2: totalD2DNFs },
        bestFinish: { d1: d1BestFinish === 99 ? null : d1BestFinish, d2: d2BestFinish === 99 ? null : d2BestFinish },
        avgFinish: {
          d1: d1FinishCount > 0 ? +(d1FinishSum / d1FinishCount).toFixed(1) : null,
          d2: d2FinishCount > 0 ? +(d2FinishSum / d2FinishCount).toFixed(1) : null,
        },
        raceH2H: { d1: totalD1AheadRace, d2: totalD2AheadRace },
        qualiH2H: { d1: totalD1AheadQuali, d2: totalD2AheadQuali },
      },
      seasonSummaries,
      yearlyPoints,
    });
  } catch (err) {
    console.error("Career H2H fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch career H2H data" }, { status: 500 });
  }
}
