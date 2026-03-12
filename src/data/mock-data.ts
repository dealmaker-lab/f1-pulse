// Mock data for initial development and fallback
import { DriverStanding, ConstructorStanding, Race, RaceResult, StrategyStint } from "@/types/f1";

export const CURRENT_SEASON = 2024;

export const mockDriverStandings: DriverStanding[] = [
  { position: 1, driver: { number: 1, code: "VER", name: "Max Verstappen", team: "Red Bull Racing", teamColor: "#3671C6", nationality: "NED" }, points: 437, wins: 9, podiums: 14, pointsHistory: [25, 44, 77, 110, 136, 169, 194, 227, 256, 277, 303, 331, 351, 374, 393, 412, 421, 429, 437] },
  { position: 2, driver: { number: 4, code: "NOR", name: "Lando Norris", team: "McLaren", teamColor: "#FF8000", nationality: "GBR" }, points: 374, wins: 4, podiums: 15, pointsHistory: [18, 26, 44, 55, 73, 98, 113, 146, 176, 207, 237, 266, 295, 315, 331, 347, 358, 367, 374] },
  { position: 3, driver: { number: 16, code: "LEC", name: "Charles Leclerc", team: "Ferrari", teamColor: "#E8002D", nationality: "MON" }, points: 356, wins: 3, podiums: 13, pointsHistory: [12, 24, 42, 60, 78, 101, 118, 144, 166, 188, 211, 237, 259, 280, 298, 319, 334, 346, 356] },
  { position: 4, driver: { number: 81, code: "PIA", name: "Oscar Piastri", team: "McLaren", teamColor: "#FF8000", nationality: "AUS" }, points: 292, wins: 2, podiums: 9, pointsHistory: [15, 28, 38, 48, 60, 78, 96, 118, 143, 160, 182, 201, 222, 239, 252, 264, 274, 284, 292] },
  { position: 5, driver: { number: 55, code: "SAI", name: "Carlos Sainz", team: "Ferrari", teamColor: "#E8002D", nationality: "ESP" }, points: 290, wins: 2, podiums: 10, pointsHistory: [10, 22, 34, 52, 66, 83, 99, 120, 138, 156, 179, 200, 219, 240, 255, 268, 278, 285, 290] },
  { position: 6, driver: { number: 44, code: "HAM", name: "Lewis Hamilton", team: "Mercedes", teamColor: "#27F4D2", nationality: "GBR" }, points: 223, wins: 2, podiums: 5, pointsHistory: [6, 12, 20, 33, 48, 60, 76, 90, 106, 118, 134, 152, 168, 180, 192, 202, 210, 218, 223] },
  { position: 7, driver: { number: 63, code: "RUS", name: "George Russell", team: "Mercedes", teamColor: "#27F4D2", nationality: "GBR" }, points: 217, wins: 1, podiums: 5, pointsHistory: [8, 18, 30, 42, 55, 68, 80, 95, 108, 122, 139, 154, 165, 176, 188, 198, 206, 213, 217] },
  { position: 8, driver: { number: 14, code: "ALO", name: "Fernando Alonso", team: "Aston Martin", teamColor: "#229971", nationality: "ESP" }, points: 70, wins: 0, podiums: 0, pointsHistory: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 66, 68, 70] },
];

export const mockConstructorStandings: ConstructorStanding[] = [
  { position: 1, team: "McLaren", teamColor: "#FF8000", points: 666, wins: 6, drivers: ["NOR", "PIA"], pointsHistory: [33, 54, 82, 103, 133, 176, 209, 264, 319, 367, 419, 467, 517, 554, 583, 611, 632, 651, 666] },
  { position: 2, team: "Ferrari", teamColor: "#E8002D", points: 652, wins: 5, drivers: ["LEC", "SAI"], pointsHistory: [22, 46, 76, 112, 144, 184, 217, 264, 304, 344, 390, 437, 478, 520, 553, 587, 612, 631, 652] },
  { position: 3, team: "Red Bull Racing", teamColor: "#3671C6", points: 589, wins: 9, drivers: ["VER", "PER"], pointsHistory: [43, 70, 110, 142, 172, 207, 237, 269, 300, 325, 358, 389, 412, 445, 472, 500, 525, 555, 589] },
  { position: 4, team: "Mercedes", teamColor: "#27F4D2", points: 440, wins: 3, drivers: ["HAM", "RUS"], pointsHistory: [14, 30, 50, 75, 103, 128, 156, 185, 214, 240, 273, 306, 333, 356, 380, 400, 416, 431, 440] },
  { position: 5, team: "Aston Martin", teamColor: "#229971", points: 94, wins: 0, drivers: ["ALO", "STR"], pointsHistory: [6, 12, 18, 24, 32, 38, 44, 50, 56, 62, 68, 74, 78, 82, 86, 90, 92, 93, 94] },
];

export const mock2024Races: Race[] = [
  { year: 2024, round: 1, name: "Bahrain Grand Prix", circuit: "Bahrain International Circuit", country: "Bahrain", date: "2024-03-02", laps: 57, circuitLength: 5.412 },
  { year: 2024, round: 2, name: "Saudi Arabian Grand Prix", circuit: "Jeddah Corniche Circuit", country: "Saudi Arabia", date: "2024-03-09", laps: 50, circuitLength: 6.174 },
  { year: 2024, round: 3, name: "Australian Grand Prix", circuit: "Albert Park Circuit", country: "Australia", date: "2024-03-24", laps: 58, circuitLength: 5.278 },
  { year: 2024, round: 4, name: "Japanese Grand Prix", circuit: "Suzuka International Racing Course", country: "Japan", date: "2024-04-07", laps: 53, circuitLength: 5.807 },
  { year: 2024, round: 5, name: "Chinese Grand Prix", circuit: "Shanghai International Circuit", country: "China", date: "2024-04-21", laps: 56, circuitLength: 5.451 },
  { year: 2024, round: 6, name: "Miami Grand Prix", circuit: "Miami International Autodrome", country: "USA", date: "2024-05-05", laps: 57, circuitLength: 5.412 },
  { year: 2024, round: 7, name: "Emilia Romagna Grand Prix", circuit: "Autodromo Enzo e Dino Ferrari", country: "Italy", date: "2024-05-19", laps: 63, circuitLength: 4.909 },
  { year: 2024, round: 8, name: "Monaco Grand Prix", circuit: "Circuit de Monaco", country: "Monaco", date: "2024-05-26", laps: 78, circuitLength: 3.337 },
  { year: 2024, round: 9, name: "Canadian Grand Prix", circuit: "Circuit Gilles Villeneuve", country: "Canada", date: "2024-06-09", laps: 70, circuitLength: 4.361 },
  { year: 2024, round: 10, name: "Spanish Grand Prix", circuit: "Circuit de Barcelona-Catalunya", country: "Spain", date: "2024-06-23", laps: 66, circuitLength: 4.657 },
];

// Mock strategy data for a typical race
export const mockStrategyData: StrategyStint[] = [
  {
    driverCode: "VER", team: "Red Bull Racing",
    stints: [
      { compound: "MEDIUM", startLap: 1, endLap: 20, avgPace: 93.2, laps: 20 },
      { compound: "HARD", startLap: 21, endLap: 42, avgPace: 93.8, laps: 22 },
      { compound: "MEDIUM", startLap: 43, endLap: 57, avgPace: 93.1, laps: 15 },
    ],
  },
  {
    driverCode: "NOR", team: "McLaren",
    stints: [
      { compound: "SOFT", startLap: 1, endLap: 15, avgPace: 92.8, laps: 15 },
      { compound: "HARD", startLap: 16, endLap: 38, avgPace: 93.5, laps: 23 },
      { compound: "MEDIUM", startLap: 39, endLap: 57, avgPace: 93.0, laps: 19 },
    ],
  },
  {
    driverCode: "LEC", team: "Ferrari",
    stints: [
      { compound: "MEDIUM", startLap: 1, endLap: 18, avgPace: 93.4, laps: 18 },
      { compound: "HARD", startLap: 19, endLap: 40, avgPace: 93.7, laps: 22 },
      { compound: "SOFT", startLap: 41, endLap: 57, avgPace: 92.9, laps: 17 },
    ],
  },
  {
    driverCode: "PIA", team: "McLaren",
    stints: [
      { compound: "MEDIUM", startLap: 1, endLap: 22, avgPace: 93.3, laps: 22 },
      { compound: "HARD", startLap: 23, endLap: 44, avgPace: 93.6, laps: 22 },
      { compound: "SOFT", startLap: 45, endLap: 57, avgPace: 93.1, laps: 13 },
    ],
  },
  {
    driverCode: "SAI", team: "Ferrari",
    stints: [
      { compound: "SOFT", startLap: 1, endLap: 14, avgPace: 92.9, laps: 14 },
      { compound: "MEDIUM", startLap: 15, endLap: 36, avgPace: 93.4, laps: 22 },
      { compound: "HARD", startLap: 37, endLap: 57, avgPace: 93.9, laps: 21 },
    ],
  },
  {
    driverCode: "HAM", team: "Mercedes",
    stints: [
      { compound: "MEDIUM", startLap: 1, endLap: 19, avgPace: 93.5, laps: 19 },
      { compound: "HARD", startLap: 20, endLap: 41, avgPace: 93.8, laps: 22 },
      { compound: "MEDIUM", startLap: 42, endLap: 57, avgPace: 93.3, laps: 16 },
    ],
  },
  {
    driverCode: "RUS", team: "Mercedes",
    stints: [
      { compound: "MEDIUM", startLap: 1, endLap: 21, avgPace: 93.4, laps: 21 },
      { compound: "HARD", startLap: 22, endLap: 43, avgPace: 93.7, laps: 22 },
      { compound: "SOFT", startLap: 44, endLap: 57, avgPace: 93.0, laps: 14 },
    ],
  },
  {
    driverCode: "ALO", team: "Aston Martin",
    stints: [
      { compound: "HARD", startLap: 1, endLap: 25, avgPace: 94.0, laps: 25 },
      { compound: "MEDIUM", startLap: 26, endLap: 57, avgPace: 93.6, laps: 32 },
    ],
  },
];

// Generate mock lap time data for a driver
export function generateMockLapTimes(driverCode: string, totalLaps: number): { lap: number; time: number; compound: string }[] {
  const basePace: Record<string, number> = {
    VER: 92.5, NOR: 92.8, LEC: 93.0, PIA: 93.1, SAI: 93.2,
    HAM: 93.3, RUS: 93.4, ALO: 93.8, PER: 93.6, STR: 94.0,
  };
  const base = basePace[driverCode] || 93.5;

  return Array.from({ length: totalLaps }, (_, i) => {
    const lap = i + 1;
    const tireAge = ((i % 20) / 20) * 0.8; // tire degradation
    const fuelEffect = ((totalLaps - i) / totalLaps) * 0.3; // fuel load
    const variance = (Math.random() - 0.5) * 0.6;
    const isPit = lap === 20 || lap === 42;
    const time = isPit ? base + 25 : base + tireAge + fuelEffect + variance;
    const compound = lap <= 20 ? "MEDIUM" : lap <= 42 ? "HARD" : "MEDIUM";
    return { lap, time: Math.round(time * 1000) / 1000, compound };
  });
}
