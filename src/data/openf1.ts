// OpenF1 API client — free, no auth required for historical data
const BASE = "https://api.openf1.org/v1";

async function fetchAPI<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const url = new URL(`${BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`OpenF1 error: ${res.status}`);
  return res.json();
}

// Get all sessions for a year
export async function getSessions(year: number) {
  return fetchAPI<any>("sessions", { year });
}

// Get drivers in a session
export async function getDrivers(sessionKey: number) {
  return fetchAPI<any>("drivers", { session_key: sessionKey });
}

// Get lap data
export async function getLaps(sessionKey: number, driverNumber?: number) {
  const params: Record<string, string | number> = { session_key: sessionKey };
  if (driverNumber) params.driver_number = driverNumber;
  return fetchAPI<any>("laps", params);
}

// Get car telemetry (speed, throttle, brake, etc.)
export async function getCarData(sessionKey: number, driverNumber: number) {
  return fetchAPI<any>("car_data", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}

// Get position data
export async function getPositions(sessionKey: number) {
  return fetchAPI<any>("position", { session_key: sessionKey });
}

// Get pit stops
export async function getPitStops(sessionKey: number) {
  return fetchAPI<any>("pit", { session_key: sessionKey });
}

// Get race control messages (flags, safety car, etc.)
export async function getRaceControl(sessionKey: number) {
  return fetchAPI<any>("race_control", { session_key: sessionKey });
}

// Get weather during session
export async function getWeather(sessionKey: number) {
  return fetchAPI<any>("weather", { session_key: sessionKey });
}

// Get stint/tire info
export async function getStints(sessionKey: number, driverNumber?: number) {
  const params: Record<string, string | number> = { session_key: sessionKey };
  if (driverNumber) params.driver_number = driverNumber;
  return fetchAPI<any>("stints", params);
}

// Get team radio messages
export async function getTeamRadio(sessionKey: number, driverNumber?: number) {
  const params: Record<string, string | number> = { session_key: sessionKey };
  if (driverNumber) params.driver_number = driverNumber;
  return fetchAPI<any>("team_radio", params);
}

// Get location data (car positions on track)
export async function getLocation(sessionKey: number, driverNumber: number) {
  return fetchAPI<any>("location", {
    session_key: sessionKey,
    driver_number: driverNumber,
  });
}
