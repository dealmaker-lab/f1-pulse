// OpenF1 API client — free, no auth required for historical data.
// Only the two helpers actually consumed by the codebase are exported.
// Everything else was dead code; chat-tools now hits OpenF1 directly via
// its own dispatch table (see src/lib/chat-tools.ts) and most Next.js
// routes proxy specific endpoints inline.

const BASE = "https://api.openf1.org/v1";

interface FetchOptions {
  /** Disable caching — required for live-session data (race_control, position, etc). */
  noCache?: boolean;
}

async function fetchAPI<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  opts: FetchOptions = {},
): Promise<T[]> {
  const url = new URL(`${BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const init: RequestInit = opts.noCache
    ? { cache: "no-store" }
    : { next: { revalidate: 3600 } };
  const res = await fetch(url.toString(), init);
  if (!res.ok) throw new Error(`OpenF1 error: ${res.status}`);
  return res.json();
}

// Race control messages (flags, safety car, etc.) — always fresh.
// Race control is the most time-critical OpenF1 surface; flags and safety
// car deployments must surface within seconds, never minutes.
export async function getRaceControl(sessionKey: number) {
  return fetchAPI<unknown>("race_control", { session_key: sessionKey }, { noCache: true });
}

// Team radio metadata (MP3 URLs + driver + timestamp).
export async function getTeamRadio(sessionKey: number, driverNumber?: number) {
  const params: Record<string, string | number> = { session_key: sessionKey };
  if (driverNumber) params.driver_number = driverNumber;
  return fetchAPI<unknown>("team_radio", params);
}
