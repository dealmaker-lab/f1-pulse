/**
 * Circuit SVG asset mapping
 * Maps OpenF1 circuit_short_name values to local SVG file paths.
 * Each circuit has two variants:
 *   - white: strokeWidth 3, full white stroke (primary track rendering)
 *   - outline: strokeWidth 1.5, half-opacity white stroke (subtle background)
 */

export interface CircuitSvgPaths {
  white: string;
  outline: string;
}

export const CIRCUIT_SVG_MAP: Record<string, CircuitSvgPaths> = {
  bahrain: {
    white: "/circuits/bahrain-white.svg",
    outline: "/circuits/bahrain-white-outline.svg",
  },
  jeddah: {
    white: "/circuits/jeddah-white.svg",
    outline: "/circuits/jeddah-white-outline.svg",
  },
  "albert-park": {
    white: "/circuits/albert-park-white.svg",
    outline: "/circuits/albert-park-white-outline.svg",
  },
  suzuka: {
    white: "/circuits/suzuka-white.svg",
    outline: "/circuits/suzuka-white-outline.svg",
  },
  shanghai: {
    white: "/circuits/shanghai-white.svg",
    outline: "/circuits/shanghai-white-outline.svg",
  },
  miami: {
    white: "/circuits/miami-white.svg",
    outline: "/circuits/miami-white-outline.svg",
  },
  imola: {
    white: "/circuits/imola-white.svg",
    outline: "/circuits/imola-white-outline.svg",
  },
  "monte-carlo": {
    white: "/circuits/monte-carlo-white.svg",
    outline: "/circuits/monte-carlo-white-outline.svg",
  },
  barcelona: {
    white: "/circuits/barcelona-white.svg",
    outline: "/circuits/barcelona-white-outline.svg",
  },
  montreal: {
    white: "/circuits/montreal-white.svg",
    outline: "/circuits/montreal-white-outline.svg",
  },
  "red-bull-ring": {
    white: "/circuits/red-bull-ring-white.svg",
    outline: "/circuits/red-bull-ring-white-outline.svg",
  },
  silverstone: {
    white: "/circuits/silverstone-white.svg",
    outline: "/circuits/silverstone-white-outline.svg",
  },
  hungaroring: {
    white: "/circuits/hungaroring-white.svg",
    outline: "/circuits/hungaroring-white-outline.svg",
  },
  "spa-francorchamps": {
    white: "/circuits/spa-francorchamps-white.svg",
    outline: "/circuits/spa-francorchamps-white-outline.svg",
  },
  zandvoort: {
    white: "/circuits/zandvoort-white.svg",
    outline: "/circuits/zandvoort-white-outline.svg",
  },
  monza: {
    white: "/circuits/monza-white.svg",
    outline: "/circuits/monza-white-outline.svg",
  },
  baku: {
    white: "/circuits/baku-white.svg",
    outline: "/circuits/baku-white-outline.svg",
  },
  "marina-bay": {
    white: "/circuits/marina-bay-white.svg",
    outline: "/circuits/marina-bay-white-outline.svg",
  },
  "circuit-of-the-americas": {
    white: "/circuits/circuit-of-the-americas-white.svg",
    outline: "/circuits/circuit-of-the-americas-white-outline.svg",
  },
  "mexico-city": {
    white: "/circuits/mexico-city-white.svg",
    outline: "/circuits/mexico-city-white-outline.svg",
  },
  interlagos: {
    white: "/circuits/interlagos-white.svg",
    outline: "/circuits/interlagos-white-outline.svg",
  },
  "las-vegas": {
    white: "/circuits/las-vegas-white.svg",
    outline: "/circuits/las-vegas-white-outline.svg",
  },
  losail: {
    white: "/circuits/losail-white.svg",
    outline: "/circuits/losail-white-outline.svg",
  },
  "yas-marina": {
    white: "/circuits/yas-marina-white.svg",
    outline: "/circuits/yas-marina-white-outline.svg",
  },
  madring: {
    white: "/circuits/madring-white.svg",
    outline: "/circuits/madring-white-outline.svg",
  },
};

/**
 * Common aliases that OpenF1 or other sources might use for circuit names.
 * Maps alternative names to the canonical key in CIRCUIT_SVG_MAP.
 */
const CIRCUIT_ALIASES: Record<string, string> = {
  sakhir: "bahrain",
  melbourne: "albert-park",
  albertpark: "albert-park",
  monaco: "monte-carlo",
  montecarlo: "monte-carlo",
  spielberg: "red-bull-ring",
  redbullring: "red-bull-ring",
  spa: "spa-francorchamps",
  spafrancorchamps: "spa-francorchamps",
  singapore: "marina-bay",
  marinabay: "marina-bay",
  cota: "circuit-of-the-americas",
  austin: "circuit-of-the-americas",
  circuitoftheamericas: "circuit-of-the-americas",
  mexico: "mexico-city",
  mexicocity: "mexico-city",
  saopaulo: "interlagos",
  brazil: "interlagos",
  lasvegas: "las-vegas",
  qatar: "losail",
  abudhabi: "yas-marina",
  yasmarina: "yas-marina",
  jedda: "jeddah",
  azerbaijan: "baku",
  netherlands: "zandvoort",
  dutch: "zandvoort",
  hungary: "hungaroring",
  budapest: "hungaroring",
  canada: "montreal",
  spain: "barcelona",
  catalonia: "barcelona",
  japan: "suzuka",
  china: "shanghai",
  britain: "silverstone",
  greatbritain: "silverstone",
  madrid: "madring",
  ifema: "madring",
  ifemamadring: "madring",
  madridring: "madring",
  spainmadrid: "madring",
};

/**
 * Look up circuit SVG paths by name.
 * Accepts exact keys, aliases, and performs fuzzy substring matching.
 *
 * @param circuitShortName - Circuit identifier from OpenF1 or similar source
 * @returns SVG paths or null if no match found
 */
export function getCircuitSvg(
  circuitShortName: string | undefined | null,
): CircuitSvgPaths | null {
  if (!circuitShortName) return null;

  const cleaned = circuitShortName.toLowerCase().trim();
  // Two normalizations: keep hyphens for canonical key match, strip them for alias match.
  const normalized = cleaned.replace(/[^a-z-]/g, "");
  const alphaOnly = cleaned.replace(/[^a-z]/g, "");

  if (CIRCUIT_SVG_MAP[normalized]) return CIRCUIT_SVG_MAP[normalized];
  if (CIRCUIT_ALIASES[alphaOnly]) return CIRCUIT_SVG_MAP[CIRCUIT_ALIASES[alphaOnly]] ?? null;

  for (const [key, value] of Object.entries(CIRCUIT_SVG_MAP)) {
    const keyAlpha = key.replace(/[^a-z]/g, "");
    if (keyAlpha.includes(alphaOnly) || alphaOnly.includes(keyAlpha)) return value;
  }
  for (const [alias, canonical] of Object.entries(CIRCUIT_ALIASES)) {
    if (alias.includes(alphaOnly) || alphaOnly.includes(alias)) {
      return CIRCUIT_SVG_MAP[canonical] ?? null;
    }
  }

  return null;
}

/**
 * Get the display name for a circuit from its short name.
 */
export const CIRCUIT_DISPLAY_NAMES: Record<string, string> = {
  bahrain: "Bahrain International Circuit",
  jeddah: "Jeddah Corniche Circuit",
  "albert-park": "Albert Park Circuit",
  suzuka: "Suzuka International Racing Course",
  shanghai: "Shanghai International Circuit",
  miami: "Miami International Autodrome",
  imola: "Autodromo Enzo e Dino Ferrari",
  "monte-carlo": "Circuit de Monaco",
  barcelona: "Circuit de Barcelona-Catalunya",
  montreal: "Circuit Gilles Villeneuve",
  "red-bull-ring": "Red Bull Ring",
  silverstone: "Silverstone Circuit",
  hungaroring: "Hungaroring",
  "spa-francorchamps": "Circuit de Spa-Francorchamps",
  zandvoort: "Circuit Zandvoort",
  monza: "Autodromo Nazionale Monza",
  baku: "Baku City Circuit",
  "marina-bay": "Marina Bay Street Circuit",
  "circuit-of-the-americas": "Circuit of the Americas",
  "mexico-city": "Autodromo Hermanos Rodriguez",
  interlagos: "Autodromo Jose Carlos Pace",
  "las-vegas": "Las Vegas Strip Circuit",
  losail: "Losail International Circuit",
  "yas-marina": "Yas Marina Circuit",
  madring: "Circuito de Madrid",
};
