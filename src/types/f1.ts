// ===== Core F1 Types =====

export interface Driver {
  number: number;
  code: string;
  name: string;
  team: string;
  teamColor: string;
  nationality: string;
  headshotUrl?: string;
}

export interface LapData {
  lap: number;
  time: number | null; // seconds
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  compound: TireCompound;
  tireLife: number;
  position: number;
  gap: number | null;
  interval: number | null;
  isPit: boolean;
  isPersonalBest: boolean;
  deleted?: boolean;
  speedTrap?: number;
}

export type TireCompound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

export interface TelemetryPoint {
  distance: number;   // meters from start
  time: number;       // seconds into lap
  speed: number;      // km/h
  throttle: number;   // 0-100
  brake: number;      // 0-100 (pressure)
  rpm: number;
  gear: number;       // 0-8
  /** @deprecated 2023-2025 legacy. 2026+ uses aero_mode + override fields below. */
  drs: number;        // 0-14
  /** 2026+ active aero state. "Z" = high downforce (default), "X" = low drag. */
  aero_mode?: "Z" | "X" | null;
  /** 2026+ override boost active for this sample (battery deployment). */
  override_active?: boolean | null;
  /** 2026+ per-lap override energy budget remaining, 0..1. */
  override_budget_remaining?: number | null;
  x: number;          // track position x
  y: number;          // track position y
}

/**
 * Raw car_data sample from OpenF1. 2026 schema is unconfirmed — we read for
 * any of the optional aero/override fields and gracefully degrade when none
 * are present (e.g. historical 2023-2025 sessions only carry `drs`).
 */
export interface CarDataEntry {
  date: string;
  driver_number: number;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  rpm: number;
  /** @deprecated 2023-2025 legacy DRS state (0-14, open at 10-14). */
  drs: number | null;
  /** 2026+ active aero state. Optional — field may not be emitted yet. */
  aero_mode?: "Z" | "X" | null;
  /** 2026+ override boost active flag. */
  override_active?: boolean | null;
  /** 2026+ per-lap override energy budget remaining, 0..1. */
  override_budget_remaining?: number | null;
}

export interface PitStop {
  lap: number;
  duration: number;   // seconds
  compoundFrom: TireCompound;
  compoundTo: TireCompound;
  timeOfDay?: string;
}

export interface RaceResult {
  position: number;
  driver: Driver;
  laps: number;
  time: string | null;
  gap: string | null;
  points: number;
  fastestLap: boolean;
  status: string;
  gridPosition: number;
}

export interface QualifyingResult {
  position: number;
  driver: Driver;
  q1: number | null;
  q2: number | null;
  q3: number | null;
}

export interface Race {
  year: number;
  round: number;
  name: string;
  circuit: string;
  country: string;
  date: string;
  laps: number;
  circuitLength: number; // km
}

export interface Season {
  year: number;
  races: Race[];
}

export interface DriverStanding {
  position: number;
  driver: Driver;
  points: number;
  wins: number;
  podiums: number;
  pointsHistory: number[]; // cumulative per race
}

export interface ConstructorStanding {
  position: number;
  team: string;
  teamColor: string;
  points: number;
  wins: number;
  drivers: string[];
  pointsHistory: number[];
}

export interface WeatherData {
  airTemp: number;
  trackTemp: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  rainfall: boolean;
}

export interface SessionInfo {
  year: number;
  round: number;
  raceName: string;
  circuit: string;
  sessionType: "FP1" | "FP2" | "FP3" | "Q" | "Sprint" | "R";
  date: string;
  weather?: WeatherData;
}

// Position change per lap for race replay
export interface PositionFrame {
  lap: number;
  positions: {
    driver: string;  // driver code
    position: number;
    x: number;
    y: number;
    gap: number;
    compound: TireCompound;
    /** @deprecated 2023-2025 legacy. 2026+ replaces DRS with override_active. */
    drs: boolean;
    /** 2026+ override active for this frame. */
    override_active?: boolean | null;
    /** 2026+ active aero state. */
    aero_mode?: "Z" | "X" | null;
    inPit: boolean;
  }[];
}

// For strategy visualization
export interface StrategyStint {
  driverCode: string;
  team: string;
  stints: {
    compound: TireCompound;
    startLap: number;
    endLap: number;
    /** Optional — only set when real lap-time data is fetched alongside stints. */
    avgPace?: number;
    laps: number;
  }[];
}
