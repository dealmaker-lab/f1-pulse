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
};
