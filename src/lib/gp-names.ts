/**
 * Map OpenF1 `circuit_short_name` values to official Grand Prix names.
 *
 * FIA documents ("2026 Austrian Grand Prix — Decision …") and r/formula1
 * race threads ("2026 Austrian Grand Prix - Race Discussion") are titled by
 * Grand Prix name, not circuit, so matching on circuit_short_name
 * ("Spielberg") silently finds nothing.
 */
const CIRCUIT_TO_GP: Record<string, string> = {
  melbourne: "Australian Grand Prix",
  sakhir: "Bahrain Grand Prix",
  jeddah: "Saudi Arabian Grand Prix",
  suzuka: "Japanese Grand Prix",
  shanghai: "Chinese Grand Prix",
  miami: "Miami Grand Prix",
  imola: "Emilia Romagna Grand Prix",
  "monte carlo": "Monaco Grand Prix",
  catalunya: "Spanish Grand Prix",
  montreal: "Canadian Grand Prix",
  spielberg: "Austrian Grand Prix",
  silverstone: "British Grand Prix",
  hungaroring: "Hungarian Grand Prix",
  "spa-francorchamps": "Belgian Grand Prix",
  zandvoort: "Dutch Grand Prix",
  monza: "Italian Grand Prix",
  baku: "Azerbaijan Grand Prix",
  singapore: "Singapore Grand Prix",
  austin: "United States Grand Prix",
  "mexico city": "Mexico City Grand Prix",
  interlagos: "São Paulo Grand Prix",
  "las vegas": "Las Vegas Grand Prix",
  lusail: "Qatar Grand Prix",
  "yas marina circuit": "Abu Dhabi Grand Prix",
  // 2026: the Madring hosts the Spanish GP while Barcelona keeps its own
  // round — FIA/Reddit titles for the new venue reference Madrid.
  madring: "Madrid Grand Prix",
  madrid: "Madrid Grand Prix",
};

/** Official GP name for a circuit, falling back to the circuit name itself. */
export function gpNameForCircuit(circuitShortName: string): string {
  return CIRCUIT_TO_GP[circuitShortName.trim().toLowerCase()] ?? circuitShortName;
}
