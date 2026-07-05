/**
 * Approximate latitude/longitude/timezone for each F1 circuit, keyed by
 * OpenF1 `circuit_short_name` (lowercased, hyphenated). Used by the weather
 * forecast widget to fetch Open-Meteo data without round-tripping to OpenF1
 * just for coordinates.
 *
 * Coordinates are pit-lane-ish — close enough for hourly weather, which has
 * ~10 km resolution. The `label` is a short, human-readable name suited for
 * UI headers (e.g. "Monza", "Yas Marina").
 */
export interface CircuitCoord {
  lat: number;
  lon: number;
  /** IANA timezone — used so Open-Meteo returns hours in local circuit time. */
  tz: string;
  label: string;
}

export const CIRCUIT_COORDS: Record<string, CircuitCoord> = {
  bahrain: { lat: 26.0325, lon: 50.5106, tz: "Asia/Bahrain", label: "Bahrain" },
  jeddah: { lat: 21.6319, lon: 39.1044, tz: "Asia/Riyadh", label: "Jeddah" },
  "albert-park": {
    lat: -37.8497,
    lon: 144.968,
    tz: "Australia/Melbourne",
    label: "Melbourne",
  },
  suzuka: { lat: 34.8431, lon: 136.541, tz: "Asia/Tokyo", label: "Suzuka" },
  shanghai: {
    lat: 31.3389,
    lon: 121.22,
    tz: "Asia/Shanghai",
    label: "Shanghai",
  },
  miami: {
    lat: 25.9581,
    lon: -80.2389,
    tz: "America/New_York",
    label: "Miami",
  },
  imola: { lat: 44.3439, lon: 11.7167, tz: "Europe/Rome", label: "Imola" },
  "monte-carlo": {
    lat: 43.7347,
    lon: 7.4206,
    tz: "Europe/Monaco",
    label: "Monaco",
  },
  barcelona: {
    lat: 41.57,
    lon: 2.2611,
    tz: "Europe/Madrid",
    label: "Barcelona",
  },
  montreal: {
    lat: 45.5,
    lon: -73.5228,
    tz: "America/Toronto",
    label: "Montreal",
  },
  "red-bull-ring": {
    lat: 47.2197,
    lon: 14.7647,
    tz: "Europe/Vienna",
    label: "Red Bull Ring",
  },
  silverstone: {
    lat: 52.0786,
    lon: -1.0169,
    tz: "Europe/London",
    label: "Silverstone",
  },
  hungaroring: {
    lat: 47.5828,
    lon: 19.2511,
    tz: "Europe/Budapest",
    label: "Hungaroring",
  },
  "spa-francorchamps": {
    lat: 50.4372,
    lon: 5.9714,
    tz: "Europe/Brussels",
    label: "Spa-Francorchamps",
  },
  zandvoort: {
    lat: 52.3888,
    lon: 4.5409,
    tz: "Europe/Amsterdam",
    label: "Zandvoort",
  },
  monza: { lat: 45.6156, lon: 9.2811, tz: "Europe/Rome", label: "Monza" },
  baku: { lat: 40.3725, lon: 49.8533, tz: "Asia/Baku", label: "Baku" },
  "marina-bay": {
    lat: 1.2914,
    lon: 103.864,
    tz: "Asia/Singapore",
    label: "Singapore",
  },
  "circuit-of-the-americas": {
    lat: 30.1328,
    lon: -97.6411,
    tz: "America/Chicago",
    label: "Austin",
  },
  "mexico-city": {
    lat: 19.4042,
    lon: -99.0907,
    tz: "America/Mexico_City",
    label: "Mexico City",
  },
  interlagos: {
    lat: -23.7036,
    lon: -46.6997,
    tz: "America/Sao_Paulo",
    label: "Interlagos",
  },
  "las-vegas": {
    lat: 36.1147,
    lon: -115.173,
    tz: "America/Los_Angeles",
    label: "Las Vegas",
  },
  losail: { lat: 25.4904, lon: 51.4544, tz: "Asia/Qatar", label: "Losail" },
  "yas-marina": {
    lat: 24.4672,
    lon: 54.6031,
    tz: "Asia/Dubai",
    label: "Yas Marina",
  },
  madrid: {
    lat: 40.4681,
    lon: -3.6155,
    tz: "Europe/Madrid",
    label: "Madrid (Madring)",
  },
};

/**
 * OpenF1 `circuit_short_name` values that differ from our canonical keys.
 * Without these, weather features were silently blank for ~8 circuits
 * (OpenF1 says "Spielberg", our key is "red-bull-ring", etc.).
 */
const CIRCUIT_COORD_ALIASES: Record<string, string> = {
  sakhir: "bahrain",
  melbourne: "albert-park",
  catalunya: "barcelona",
  spielberg: "red-bull-ring",
  austin: "circuit-of-the-americas",
  cota: "circuit-of-the-americas",
  lusail: "losail",
  singapore: "marina-bay",
  "yas-marina-circuit": "yas-marina",
  "sao-paulo": "interlagos",
  madring: "madrid",
};

/**
 * Look up a circuit by short-name. Tolerates `undefined`, mixed case, and
 * common alias formats (e.g. `Spa Francorchamps` → `spa-francorchamps`).
 * Returns `null` when no match exists so callers can render an empty state
 * rather than crashing on unknown circuits (e.g. one-off track changes).
 */
export function getCircuitCoords(
  name: string | undefined,
): CircuitCoord | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase().replace(/\s+/g, "-");
  const key = CIRCUIT_COORD_ALIASES[normalized] ?? normalized;
  return CIRCUIT_COORDS[key] ?? null;
}
