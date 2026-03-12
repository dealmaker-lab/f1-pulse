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
  drs: number;        // 0-14
  x: number;          // track position x
  y: number;          // track position y
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
    drs: boolean;
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
    avgPace: number;
    laps: number;
  }[];
}
