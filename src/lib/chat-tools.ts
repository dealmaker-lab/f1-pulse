import { tool } from "ai";
import { z } from "zod";

/**
 * Base URL for internal API calls.
 * In server context, we need the full URL for fetch().
 */
function getBaseUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function fetchApi(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(path, getBaseUrl());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
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
        const res = await fetch(
          `https://api.openf1.org/v1/race_control?session_key=${session_key}`,
          { cache: "no-store" },
        );
        if (!res.ok) return { error: "Race control data not available for this session" };
        const data = await res.json();
        if (!Array.isArray(data)) return data;
        return data.slice(0, 50).map((m: Record<string, unknown>) => ({
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
      return data
        .map((r: Record<string, unknown>) => {
          const driver = r.Driver as Record<string, string> | undefined;
          const constructor = r.Constructor as Record<string, string> | undefined;
          const grid = parseInt(r.grid as string) || 0;
          const finish = parseInt(r.position as string) || 0;
          return {
            driver: driver?.code || driver?.familyName,
            team: constructor?.name,
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
      "Get detailed car telemetry for a driver: speed, throttle, brake, gear, DRS, RPM at each sample point. Useful for analyzing driving style and car performance.",
    inputSchema: z.object({
      session_key: z.number().describe("Session key"),
      driver_number: z.number().describe("Driver car number"),
    }),
    execute: async ({ session_key, driver_number }) => {
      const data = await fetchApi("/api/f1/car-data", { session_key, driver_number });
      if (!Array.isArray(data)) return data;
      const speeds = data
        .map((d: Record<string, unknown>) => d.speed as number)
        .filter((s: number) => s > 0);
      const topSpeed = Math.max(...speeds);
      const avgSpeed = speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length;
      const drsCount = data.filter(
        (d: Record<string, unknown>) => (d.drs as number) >= 10 && (d.drs as number) <= 14,
      ).length;
      const heavyBraking = data.filter(
        (d: Record<string, unknown>) => (d.brake as number) > 50,
      ).length;
      return {
        samples: data.length,
        topSpeed: +topSpeed.toFixed(1),
        avgSpeed: +avgSpeed.toFixed(1),
        drsActivations: drsCount,
        heavyBrakingEvents: heavyBraking,
        maxGear: Math.max(...data.map((d: Record<string, unknown>) => (d.n_gear as number) || 0)),
        maxRpm: Math.max(...data.map((d: Record<string, unknown>) => (d.rpm as number) || 0)),
      };
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
