/**
 * Jolpica (Ergast mirror) API helper with automatic pagination.
 * The Jolpica API caps results at ~100 per request, so we paginate
 * in parallel to fetch full season data.
 */

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const PAGE_SIZE = 100;

export { JOLPICA_BASE };

/**
 * Fetch all paginated results from a Jolpica endpoint.
 * Returns the merged array of Races with all Results/QualifyingResults intact.
 */
export async function fetchAllRaces(
  endpoint: string,
  resultKey: string = "Results"
): Promise<any[]> {
  // First request to get total count
  const separator = endpoint.includes("?") ? "&" : "?";
  const firstRes = await fetch(
    `${endpoint}${separator}limit=${PAGE_SIZE}&offset=0`,
    { cache: "no-store" }
  );
  const firstJson = await firstRes.json();
  const total = parseInt(firstJson?.MRData?.total || "0");
  let allRaces: any[] = firstJson?.MRData?.RaceTable?.Races || [];

  if (total <= PAGE_SIZE) return allRaces;

  // Fetch remaining pages in parallel
  const pages = Math.ceil(total / PAGE_SIZE);
  const fetches = [];
  for (let i = 1; i < pages; i++) {
    fetches.push(
      fetch(
        `${endpoint}${separator}limit=${PAGE_SIZE}&offset=${i * PAGE_SIZE}`,
        { cache: "no-store" }
      ).then((r) => r.json())
    );
  }

  const results = await Promise.all(fetches);
  for (const json of results) {
    const races = json?.MRData?.RaceTable?.Races || [];
    for (const race of races) {
      const existing = allRaces.find((r: any) => r.round === race.round);
      if (existing) {
        // Merge results from this page into existing race
        existing[resultKey] = [
          ...(existing[resultKey] || []),
          ...(race[resultKey] || []),
        ];
      } else {
        allRaces.push(race);
      }
    }
  }

  allRaces.sort((a: any, b: any) => parseInt(a.round) - parseInt(b.round));
  return allRaces;
}
