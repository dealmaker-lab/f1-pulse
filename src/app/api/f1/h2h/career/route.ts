import { NextRequest, NextResponse } from "next/server";
import { JOLPICA_BASE, fetchAllRaces } from "@/lib/jolpica";

/**
 * Career H2H API — aggregates head-to-head stats across ALL seasons where
 * both drivers competed. Uses Jolpica/Ergast which has data back to 1950.
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

/** Match a driver in results by code OR driverId */
function matchesDriver(driver: any, code: string, driverId: string): boolean {
  if (!driver) return false;
  return driverCode(driver) === code.toUpperCase() || driver.driverId === driverId;
}

function getTeamColor(constructorId: string): string {
  const colors: Record<string, string> = {
    mercedes: "#27F4D2", ferrari: "#E8002D", red_bull: "#3671C6",
    mclaren: "#FF8000", aston_martin: "#229971", alpine: "#FF87BC",
    williams: "#64C4FF", rb: "#6692FF", haas: "#B6BABD",
    sauber: "#52E252", audi: "#00E701", cadillac: "#1E3D6B",
    racing_bulls: "#6692FF", renault: "#FFF500", lotus_f1: "#FFB800",
    brawn: "#B1D755", force_india: "#FF80C7", manor: "#6E0000",
    caterham: "#005030", hrt: "#A08050", virgin: "#CC0000",
    toro_rosso: "#469BFF", toyota: "#CC0000", honda: "#FFFFFF",
    bmw_sauber: "#006EFF", super_aguri: "#FFFFFF",
    jordan: "#EBC94A", minardi: "#000000", jaguar: "#006400",
    benetton: "#00A550", tyrrell: "#006EFF", ligier: "#0066CC",
    arrows: "#FF6600", prost: "#0033CC", stewart: "#FFFFFF",
  };
  return colors[constructorId] || "#888888";
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
 * If the input already looks like a driverId (lowercase, contains underscore or >3 chars), return as-is.
 */
async function resolveDriverId(codeOrId: string): Promise<string> {
  // Already a driverId (lowercase, longer than 3 chars or contains underscore)
  if (codeOrId.length > 3 || codeOrId.includes("_") || codeOrId === codeOrId.toLowerCase()) {
    return codeOrId;
  }

  // It's a 3-letter code — search recent seasons for the mapping
  const currentYear = new Date().getFullYear();
  for (let year = currentYear; year >= currentYear - 5; year--) {
    try {
      const res = await fetch(`${JOLPICA_BASE}/${year}/drivers.json?limit=50`, { cache: "no-store" });
      const data = await res.json();
      const drivers = data?.MRData?.DriverTable?.Drivers || [];
      const match = drivers.find((d: any) => d.code === codeOrId.toUpperCase());
      if (match) return match.driverId;
    } catch {
      continue;
    }
  }

  // Fallback: try the code as-is (lowercase)
  return codeOrId.toLowerCase();
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

    // First, find all seasons where BOTH drivers competed
    // Fetch career results for each driver from Jolpica
    const [d1SeasonsRes, d2SeasonsRes] = await Promise.all([
      fetch(`${JOLPICA_BASE}/drivers/${d1Id}/seasons/?format=json&limit=100`, { cache: "no-store" }),
      fetch(`${JOLPICA_BASE}/drivers/${d2Id}/seasons/?format=json&limit=100`, { cache: "no-store" }),
    ]);

    const d1SeasonsJson = await d1SeasonsRes.json();
    const d2SeasonsJson = await d2SeasonsRes.json();

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

    // Common seasons
    const commonSeasons = Array.from(d1Seasons).filter((y) => d2Seasons.has(y)).sort((a: number, b: number) => a - b) as number[];

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

    // Limit to 10 concurrent fetches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < commonSeasons.length; i += batchSize) {
      const batch = commonSeasons.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (year) => {
          const [races, qualifyingRaces] = await Promise.all([
            fetchAllRaces(`${JOLPICA_BASE}/${year}/results/?format=json`, "Results"),
            fetchAllRaces(`${JOLPICA_BASE}/${year}/qualifying/?format=json`, "QualifyingResults").catch(() => []),
          ]);
          return { year, races, qualifyingRaces };
        })
      );

      for (const { year, races, qualifyingRaces } of batchResults) {
        let seasonD1Points = 0, seasonD2Points = 0;
        let seasonD1Wins = 0, seasonD2Wins = 0;
        let seasonD1AheadRace = 0, seasonD2AheadRace = 0;
        let seasonRaces = 0;
        let seasonD1Team = "", seasonD2Team = "";

        for (const race of races) {
          const results = race.Results || [];
          const r1 = results.find((r: any) => matchesDriver(r.Driver, d1, d1Id));
          const r2 = results.find((r: any) => matchesDriver(r.Driver, d2, d2Id));

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
        for (const qRace of qualifyingRaces) {
          const qResults = qRace.QualifyingResults || [];
          const q1 = qResults.find((r: any) => matchesDriver(r.Driver, d1, d1Id));
          const q2 = qResults.find((r: any) => matchesDriver(r.Driver, d2, d2Id));
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
