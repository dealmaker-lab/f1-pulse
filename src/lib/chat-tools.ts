import { tool } from "ai";
import { z } from "zod";
import { getRaceControl } from "@/data/openf1";

/**
 * Chat tools call upstream public APIs directly instead of looping through
 * our own /api/f1/* proxies. Looping through our routes hits Vercel
 * Deployment Protection (server-to-server fetch sees a 401), which would
 * silently break every tool call. Going direct also saves a cold-start
 * hop per tool call.
 *
 * Upstream targets:
 *   OpenF1   → https://api.openf1.org/v1/{endpoint}
 *   Jolpica  → https://api.jolpi.ca/ergast/f1/{path}.json
 *
 * Internal paths kept for backward compatibility with the existing tool
 * bodies — the dispatch table below maps them to the right upstream.
 */
const OPENF1 = "https://api.openf1.org/v1";
const JOLPICA = "https://api.jolpi.ca/ergast/f1";

const FETCH_TIMEOUT_MS = 8_000;

/** Minimal Jolpica/Ergast envelope shapes for the routes we consume. */
interface JolpicaRoot {
  MRData?: {
    total?: string;
    StandingsTable?: {
      StandingsLists?: Array<{
        DriverStandings?: JolpicaDriverStanding[];
        ConstructorStandings?: JolpicaConstructorStanding[];
      }>;
    };
    RaceTable?: {
      Races?: Array<{
        round: string;
        raceName: string;
        date: string;
        time?: string;
        Circuit?: {
          circuitName?: string;
          Location?: { country?: string; locality?: string };
        };
        Results?: JolpicaResult[];
      }>;
    };
  };
}
interface JolpicaDriverStanding {
  position: string; points: string; wins: string;
  Driver?: { code?: string; givenName?: string; familyName?: string; nationality?: string };
  Constructors?: Array<{ name?: string }>;
}
interface JolpicaConstructorStanding {
  position: string; points: string; wins: string;
  Constructor?: { name?: string; nationality?: string };
}
interface JolpicaResult {
  position: string; grid: string; points: string; status?: string;
  Driver?: { code?: string; givenName?: string; familyName?: string };
  Constructor?: { name?: string };
}

/** Pull-with-timeout — keeps the chat stream from hanging on a flaky upstream. */
async function safeFetch(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Translate a legacy "/api/f1/..." path into a real upstream call. */
async function fetchApi(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const { year, round, session_key, driver_number, driver1, driver2, session_name } = params;

  // ── Jolpica (historical) ────────────────────────────────────────────
  // Each branch unwraps Jolpica's nested MRData envelope into the flat
  // shape the existing tool bodies expect (so we don't have to rewrite
  // every tool's downstream consumption code).
  if (path === "/api/f1/standings/drivers") {
    const json = (await safeFetch(
      `${JOLPICA}/${year}/driverstandings.json?limit=100`,
    )) as JolpicaRoot;
    const standings = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
    return standings.map((s) => ({
      position: parseInt(s.position),
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
      driver: {
        code: s.Driver?.code,
        name: `${s.Driver?.givenName ?? ""} ${s.Driver?.familyName ?? ""}`.trim(),
        nationality: s.Driver?.nationality,
        team: s.Constructors?.[0]?.name,
      },
    }));
  }
  if (path === "/api/f1/standings/constructors") {
    const json = (await safeFetch(
      `${JOLPICA}/${year}/constructorstandings.json?limit=100`,
    )) as JolpicaRoot;
    const standings = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
    return standings.map((s) => ({
      position: parseInt(s.position),
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
      team: s.Constructor?.name,
      nationality: s.Constructor?.nationality,
    }));
  }
  if (path === "/api/f1/results") {
    const r = round !== undefined ? `/${round}` : "";
    const json = (await safeFetch(
      `${JOLPICA}/${year}${r}/results.json?limit=100`,
    )) as JolpicaRoot;
    const races = json?.MRData?.RaceTable?.Races ?? [];
    // Flat array of results when a single round is requested; otherwise return per-race rows.
    if (round !== undefined && races[0]) {
      return (races[0].Results ?? []).map((r) => ({
        position: parseInt(r.position),
        grid: parseInt(r.grid),
        points: parseFloat(r.points),
        status: r.status,
        driver: {
          code: r.Driver?.code,
          name: `${r.Driver?.givenName ?? ""} ${r.Driver?.familyName ?? ""}`.trim(),
        },
        team: r.Constructor?.name,
      }));
    }
    return races.map((race) => ({
      round: race.round,
      raceName: race.raceName,
      date: race.date,
      results: (race.Results ?? []).slice(0, 3).map((r) => ({
        position: parseInt(r.position),
        driver: r.Driver?.code,
        team: r.Constructor?.name,
      })),
    }));
  }
  if (path === "/api/f1/h2h" && driver1 && driver2) {
    // Pull both drivers' season results; tool body does the comparison.
    const [a, b] = await Promise.all([
      safeFetch(`${JOLPICA}/${year}/drivers/${driver1}/results.json?limit=100`),
      safeFetch(`${JOLPICA}/${year}/drivers/${driver2}/results.json?limit=100`),
    ]);
    return { driver1: a, driver2: b };
  }
  if (path === "/api/f1/races") {
    // Season calendar — raw Jolpica race rows (getSeasonCalendar maps them).
    const json = (await safeFetch(`${JOLPICA}/${year}.json?limit=100`)) as JolpicaRoot;
    return json?.MRData?.RaceTable?.Races ?? [];
  }
  if (path === "/api/f1/standings/progression") {
    // Cumulative points per driver per round, built from paginated season
    // results (Jolpica caps limit at 100 rows per page). Sprint points are
    // not included — Jolpica exposes them on a separate endpoint.
    const races = new Map<
      number,
      { raceName: string; rows: Array<{ code: string; points: number }> }
    >();
    for (let offset = 0; offset < 1500; offset += 100) {
      const json = (await safeFetch(
        `${JOLPICA}/${year}/results.json?limit=100&offset=${offset}`,
      )) as JolpicaRoot;
      for (const race of json?.MRData?.RaceTable?.Races ?? []) {
        const rnd = parseInt(race.round);
        if (!races.has(rnd)) races.set(rnd, { raceName: race.raceName, rows: [] });
        for (const r of race.Results ?? []) {
          races.get(rnd)!.rows.push({
            code: r.Driver?.code ?? r.Driver?.familyName ?? "?",
            points: parseFloat(r.points || "0"),
          });
        }
      }
      const total = parseInt(json?.MRData?.total ?? "0");
      if (Number.isNaN(total) || offset + 100 >= total) break;
    }
    const rounds = Array.from(races.keys()).sort((a, b) => a - b);
    const raceNames: string[] = [];
    const cumulative = new Map<string, number>();
    const history = new Map<string, number[]>();
    for (const rnd of rounds) {
      const race = races.get(rnd)!;
      raceNames.push(race.raceName);
      for (const row of race.rows) {
        cumulative.set(row.code, (cumulative.get(row.code) ?? 0) + row.points);
      }
      cumulative.forEach((pts, code) => {
        if (!history.has(code)) {
          history.set(code, Array(raceNames.length - 1).fill(0));
        }
        history.get(code)!.push(pts);
      });
    }
    const drivers = Array.from(history.entries())
      .map(([code, pointsHistory]) => ({
        code,
        points: pointsHistory[pointsHistory.length - 1] ?? 0,
        pointsHistory,
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
    return { raceNames, drivers };
  }

  // ── OpenF1 (live + recent telemetry, 2023+) ─────────────────────────
  if (path === "/api/f1/sessions") {
    return safeFetch(`${OPENF1}/sessions${qs({ year, session_name })}`);
  }
  if (path === "/api/f1/meetings") {
    return safeFetch(`${OPENF1}/meetings${qs({ year })}`);
  }
  if (path === "/api/f1/laps") {
    return safeFetch(`${OPENF1}/laps${qs({ session_key, driver_number })}`);
  }
  if (path === "/api/f1/weather") {
    return safeFetch(`${OPENF1}/weather${qs({ session_key })}`);
  }
  if (path === "/api/f1/stints") {
    return safeFetch(`${OPENF1}/stints${qs({ session_key, driver_number })}`);
  }
  if (path === "/api/f1/positions") {
    return safeFetch(`${OPENF1}/position${qs({ session_key })}`);
  }
  if (path === "/api/f1/intervals") {
    return safeFetch(`${OPENF1}/intervals${qs({ session_key })}`);
  }
  if (path === "/api/f1/car-data") {
    return safeFetch(`${OPENF1}/car_data${qs({ session_key, driver_number })}`);
  }
  if (path === "/api/f1/pit") {
    return safeFetch(`${OPENF1}/pit${qs({ session_key, driver_number })}`);
  }

  throw new Error(`Unmapped tool path: ${path}`);
}

export const chatTools = {
  getDriverStandings: tool({
    description:
      "Get F1 driver championship standings for a given season year (1950-present). Returns position, points, wins, driver name, team, and nationality.",
    inputSchema: z.object({
      year: z.number().min(1950).max(2026).describe("Season year"),
    }),
    execute: async ({ year }) => {
      const data = await fetchApi("/api/f1/standings/drivers", { year });
      // Limit to top 10 to keep response concise
      return Array.isArray(data) ? data.slice(0, 10) : data;
    },
  }),

  getConstructorStandings: tool({
    description:
      "Get F1 constructor (team) championship standings for a given season year. Returns team name, points, wins, and position.",
    inputSchema: z.object({
      year: z.number().min(1950).max(2026).describe("Season year"),
    }),
    execute: async ({ year }) => {
      const data = await fetchApi("/api/f1/standings/constructors", { year });
      return Array.isArray(data) ? data.slice(0, 10) : data;
    },
  }),

  getRaceResults: tool({
    description:
      "Get F1 race results for a season. Optionally filter by round number. Returns finishing positions, driver names, teams, points, laps, status, and fastest laps.",
    inputSchema: z.object({
      year: z.number().min(1950).max(2026).describe("Season year"),
      round: z.number().min(1).max(24).optional().describe("Race round number (1-24)"),
    }),
    execute: async ({ year, round }) => {
      const data = await fetchApi("/api/f1/results", { year, round });
      return data;
    },
  }),

  getSessionInfo: tool({
    description:
      "Get F1 session information (practice, qualifying, race) for a given year. Returns session keys, dates, circuit names, and countries. Use this to find session_key values needed by other tools.",
    inputSchema: z.object({
      year: z.number().min(2023).max(2026).describe("Season year (2023+ for OpenF1 data)"),
      session_name: z.enum(["Race", "Qualifying", "Sprint", "Practice 1", "Practice 2", "Practice 3"]).optional(),
    }),
    execute: async ({ year, session_name }) => {
      const data = await fetchApi("/api/f1/sessions", { year, session_name });
      // Summarize — full list can be very long
      if (Array.isArray(data)) {
        return data.map((s: any) => ({
          session_key: s.session_key,
          session_name: s.session_name,
          circuit: s.circuit_short_name,
          country: s.country_name,
          date: s.date_start,
        }));
      }
      return data;
    },
  }),

  getMeetings: tool({
    description:
      "Get F1 race weekend (Grand Prix) information for a season. Returns meeting keys, names, circuits, countries, and dates.",
    inputSchema: z.object({
      year: z.number().min(2023).max(2026).describe("Season year (2023+ for OpenF1 data)"),
    }),
    execute: async ({ year }) => {
      const data = await fetchApi("/api/f1/meetings", { year });
      return data;
    },
  }),

  getLapData: tool({
    description:
      "Get detailed lap-by-lap timing data for a specific session and optionally a specific driver. Requires a session_key (use getSessionInfo to find it). Returns lap number, lap duration, sector times, and more.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key from getSessionInfo"),
      driver_number: z.number().optional().describe("Driver car number (e.g., 1 for Verstappen, 44 for Hamilton)"),
    }),
    execute: async ({ session_key, driver_number }) => {
      const data = await fetchApi("/api/f1/laps", { session_key, driver_number });
      // Limit to prevent huge responses
      if (Array.isArray(data) && data.length > 50) {
        return { total_laps: data.length, sample: data.slice(0, 30), note: "Showing first 30 laps" };
      }
      return data;
    },
  }),

  getWeather: tool({
    description:
      "Get weather conditions during an F1 session (track temperature, air temperature, humidity, wind speed, rainfall). Requires a session_key.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key from getSessionInfo"),
    }),
    execute: async ({ session_key }) => {
      const data = await fetchApi("/api/f1/weather", { session_key });
      // Summarize weather
      if (Array.isArray(data) && data.length > 10) {
        return { readings: data.length, first: data[0], last: data[data.length - 1] };
      }
      return data;
    },
  }),

  getStints: tool({
    description:
      "Get pit stop and tire stint data for a session. Returns compound used, stint number, lap start/end, and tire age. Requires a session_key.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key from getSessionInfo"),
      driver_number: z.number().optional().describe("Driver car number"),
    }),
    execute: async ({ session_key, driver_number }) => {
      const data = await fetchApi("/api/f1/stints", { session_key, driver_number });
      return data;
    },
  }),

  getH2HComparison: tool({
    description:
      "Get head-to-head race comparison between two drivers for a season. Compares finishing positions across all races. Use driver codes like 'max_verstappen', 'lewis_hamilton', 'lando_norris', 'charles_leclerc'.",
    inputSchema: z.object({
      year: z.number().min(1950).max(2026).describe("Season year"),
      driver1: z.string().describe("First driver ID (e.g., 'max_verstappen')"),
      driver2: z.string().describe("Second driver ID (e.g., 'lewis_hamilton')"),
    }),
    execute: async ({ year, driver1, driver2 }) => {
      const data = await fetchApi("/api/f1/h2h", { year, driver1, driver2 });
      return data;
    },
  }),

  getPositions: tool({
    description:
      "Get driver position changes throughout a session lap by lap. Shows how positions evolved during the race. Requires a session_key.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key from getSessionInfo"),
    }),
    execute: async ({ session_key }) => {
      const data = await fetchApi("/api/f1/positions", { session_key });
      if (Array.isArray(data) && data.length > 100) {
        return { total: data.length, sample: data.slice(0, 60), note: "Showing first 60 entries" };
      }
      return data;
    },
  }),

  getIntervals: tool({
    description:
      "Get gap-to-leader and interval data during a session. Shows time gaps between drivers. Requires a session_key.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key from getSessionInfo"),
    }),
    execute: async ({ session_key }) => {
      const data = await fetchApi("/api/f1/intervals", { session_key });
      if (Array.isArray(data) && data.length > 100) {
        return { total: data.length, sample: data.slice(-40), note: "Showing last 40 entries" };
      }
      return data;
    },
  }),

  getTireStrategy: tool({
    description:
      "Get tire compound choices, stint lengths, and pit stop timing for all drivers in a session. Shows what compound each driver used per stint and how many laps they ran on it.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key from getSessionInfo"),
    }),
    execute: async ({ session_key }) => {
      const data = await fetchApi("/api/f1/stints", { session_key });
      if (!Array.isArray(data)) return data;
      const byDriver: Record<number, { stint: number; compound: string; lapStart: number; lapEnd: number; laps: number }[]> = {};
      for (const s of data) {
        if (!byDriver[s.driver_number]) byDriver[s.driver_number] = [];
        byDriver[s.driver_number].push({
          stint: s.stint_number,
          compound: s.compound,
          lapStart: s.lap_start,
          lapEnd: s.lap_end,
          laps: (s.lap_end || 0) - (s.lap_start || 0) + 1,
        });
      }
      return { strategies: byDriver, totalDrivers: Object.keys(byDriver).length };
    },
  }),

  getPitStopAnalysis: tool({
    description:
      "Analyze pit stop data: number of stops, when they pitted, and stint durations for a session. Optionally filter by driver.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key"),
      driver_number: z.number().optional().describe("Filter to specific driver"),
    }),
    execute: async ({ session_key, driver_number }) => {
      const data = await fetchApi("/api/f1/stints", { session_key, driver_number });
      if (!Array.isArray(data)) return data;
      const byDriver: Record<number, { stops: number; pitLaps: number[]; compounds: string[] }> = {};
      for (const s of data) {
        if (!byDriver[s.driver_number])
          byDriver[s.driver_number] = { stops: 0, pitLaps: [], compounds: [] };
        const d = byDriver[s.driver_number];
        if (s.stint_number > 1) {
          d.stops++;
          d.pitLaps.push(s.lap_start);
        }
        d.compounds.push(s.compound || "UNKNOWN");
      }
      return byDriver;
    },
  }),

  getRaceControlMessages: tool({
    description:
      "Get FIA race control messages for a session: flags, safety car deployments, penalties, DRS enabled/disabled, VSC, and other official notifications.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key"),
    }),
    execute: async ({ session_key }) => {
      try {
        const data = await getRaceControl(session_key);
        if (!Array.isArray(data)) return data;
        // getRaceControl returns unknown[]; narrow each entry to a record.
        return (data as Record<string, unknown>[]).slice(0, 50).map((m) => ({
          date: m.date,
          lap: m.lap_number,
          category: m.category,
          flag: m.flag,
          message: m.message,
          scope: m.scope,
          driver_number: m.driver_number,
        }));
      } catch {
        return { error: "Failed to fetch race control data" };
      }
    },
  }),

  getGridVsFinish: tool({
    description:
      "Compare starting grid position vs finishing position for all drivers in a race. Shows who gained or lost the most positions.",
    inputSchema: z.object({
      year: z.number().min(1950).max(2026).describe("Season year"),
      round: z.number().min(1).max(24).describe("Race round number"),
    }),
    execute: async ({ year, round }) => {
      const data = await fetchApi("/api/f1/results", { year, round });
      if (!Array.isArray(data)) return data;
      // fetchApi returns the mapped shape ({ driver: { code, name }, team,
      // grid, position, status }) — not raw Jolpica rows.
      return data
        .map((r: Record<string, unknown>) => {
          const driver = r.driver as { code?: string; name?: string } | undefined;
          const grid = Number(r.grid) || 0;
          const finish = Number(r.position) || 0;
          return {
            driver: driver?.code || driver?.name,
            team: r.team,
            grid,
            finish,
            gained: grid - finish,
            status: r.status,
          };
        })
        .sort((a: { gained: number }, b: { gained: number }) => b.gained - a.gained);
    },
  }),

  getLapConsistency: tool({
    description:
      "Calculate lap time consistency metrics for a driver in a session: average, median, standard deviation, best/worst lap, and consistency score.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key"),
      driver_number: z.number().describe("Driver car number"),
    }),
    execute: async ({ session_key, driver_number }) => {
      const data = await fetchApi("/api/f1/laps", { session_key, driver_number });
      if (!Array.isArray(data) || data.length === 0) return { error: "No lap data available" };
      const times = data
        .filter((l: Record<string, unknown>) => (l.lap_duration as number) > 0)
        .map((l: Record<string, unknown>) => l.lap_duration as number);
      if (times.length === 0) return { error: "No valid lap times" };
      const avg = times.reduce((a: number, b: number) => a + b, 0) / times.length;
      const sorted = [...times].sort((a: number, b: number) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const variance =
        times.reduce((sum: number, t: number) => sum + (t - avg) ** 2, 0) / times.length;
      const stdDev = Math.sqrt(variance);
      return {
        laps: times.length,
        average: +avg.toFixed(3),
        median: +median.toFixed(3),
        best: +sorted[0].toFixed(3),
        worst: +sorted[sorted.length - 1].toFixed(3),
        stdDev: +stdDev.toFixed(3),
        consistencyScore: Math.max(0, +(100 - stdDev * 50).toFixed(1)),
      };
    },
  }),

  getDriverTelemetry: tool({
    description:
      "Get detailed car telemetry for a driver: speed, throttle, brake, gear, RPM, plus 2026 active-aero mode (Z/X) and Override boost activations at each sample point. Falls back to legacy DRS counts for 2023-2025 sessions.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key"),
      driver_number: z.number().describe("Driver car number"),
    }),
    execute: async ({ session_key, driver_number }) => {
      const data = await fetchApi("/api/f1/car-data", { session_key, driver_number });
      if (!Array.isArray(data)) return data;
      if (data.length === 0) return { error: "No telemetry data available" };

      // Single pass over the array — Math.max(...arr) on multi-thousand-element
      // arrays risks stack overflow and traverses 5x for no reason.
      let speedSum = 0, speedCount = 0;
      let topSpeed = 0, maxGear = 0, maxRpm = 0;
      let drsCount = 0, heavyBraking = 0;
      // 2026 active aero + override counters. OpenF1's exact schema for these
      // is unconfirmed — we read each field defensively and only emit the
      // distribution if the upstream actually populated values.
      let overrideActivations = 0;
      let aeroZCount = 0;
      let aeroXCount = 0;
      let aeroSampleCount = 0;
      let overrideBudgetSeen = false;
      let overrideBudgetMin = 1;
      for (const row of data as Record<string, unknown>[]) {
        const speed = (row.speed as number) || 0;
        if (speed > 0) { speedSum += speed; speedCount++; if (speed > topSpeed) topSpeed = speed; }
        const gear = (row.n_gear as number) || 0;
        if (gear > maxGear) maxGear = gear;
        const rpm = (row.rpm as number) || 0;
        if (rpm > maxRpm) maxRpm = rpm;
        const drs = (row.drs as number) || 0;
        if (drs >= 10 && drs <= 14) drsCount++;
        if ((row.brake as number) > 50) heavyBraking++;

        // 2026 fields — all optional. Guard each read.
        const aeroMode = row.aero_mode;
        if (aeroMode === "Z") { aeroZCount++; aeroSampleCount++; }
        else if (aeroMode === "X") { aeroXCount++; aeroSampleCount++; }

        if (row.override_active === true) overrideActivations++;

        const budget = row.override_budget_remaining;
        if (typeof budget === "number" && Number.isFinite(budget)) {
          overrideBudgetSeen = true;
          if (budget < overrideBudgetMin) overrideBudgetMin = budget;
        }
      }
      const avgSpeed = speedCount > 0 ? speedSum / speedCount : 0;

      // Output both shapes — the LLM can pick whichever matches the session
      // era. We always emit drsActivations (legacy) so historical 2023-2025
      // questions still work; we only emit the 2026 aeroMode block when the
      // upstream actually provided aero_mode samples.
      const base = {
        samples: data.length,
        topSpeed: +topSpeed.toFixed(1),
        avgSpeed: +avgSpeed.toFixed(1),
        drsActivations: drsCount,
        overrideActivations,
        heavyBrakingEvents: heavyBraking,
        maxGear,
        maxRpm,
      };
      if (aeroSampleCount > 0) {
        return {
          ...base,
          aeroMode: {
            z: aeroZCount,
            x: aeroXCount,
            xPercent: +((aeroXCount / aeroSampleCount) * 100).toFixed(1),
            samples: aeroSampleCount,
          },
          overrideBudget: overrideBudgetSeen
            ? { minRemaining: +overrideBudgetMin.toFixed(3) }
            : undefined,
        };
      }
      return base;
    },
  }),

  getSeasonCalendar: tool({
    description:
      "Get the full F1 race calendar for a season with dates, circuits, countries, and round numbers.",
    inputSchema: z.object({
      year: z.number().min(1950).max(2026).describe("Season year"),
    }),
    execute: async ({ year }) => {
      const data = await fetchApi("/api/f1/races", { year });
      if (!Array.isArray(data)) return data;
      return data.map((r: Record<string, unknown>) => {
        const circuit = r.Circuit as Record<string, unknown> | undefined;
        const location = circuit?.Location as Record<string, string> | undefined;
        return {
          round: r.round,
          name: r.raceName,
          circuit: circuit?.circuitName,
          country: location?.country,
          date: r.date,
          time: r.time,
        };
      });
    },
  }),

  getChampionshipProgression: tool({
    description:
      "Get championship points progression throughout a season, showing how each driver's points total changed race by race.",
    inputSchema: z.object({
      year: z.number().min(1950).max(2026).describe("Season year"),
    }),
    execute: async ({ year }) => {
      const data = await fetchApi("/api/f1/standings/progression", { year });
      return data;
    },
  }),

  queryDatabase: tool({
    description:
      "Execute a natural language query against the F1 database. Use for complex analytical questions that require SQL: comparing multiple drivers, aggregating across races, filtering by multiple conditions, or any question that the other specific tools can't answer directly.",
    inputSchema: z.object({
      question: z
        .string()
        .describe("The natural language question to answer using the F1 database"),
    }),
    execute: async ({ question }) => {
      const { executeNL2SQL } = await import("./nl2sql");
      const result = await executeNL2SQL(question);
      if (result.error) {
        return { error: result.error, sql: result.sql };
      }
      return {
        explanation: result.explanation,
        data: result.data.slice(0, 20), // Limit for chat context
        rowCount: result.rowCount,
        sql: result.sql,
      };
    },
  }),
};
