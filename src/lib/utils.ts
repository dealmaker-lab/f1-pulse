import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format lap time from seconds to MM:SS.mmm
export function formatLapTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "--:--.---";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}

// Format gap between drivers
export function formatGap(gap: number | null): string {
  if (gap === null || gap === undefined) return "";
  if (gap === 0) return "LEADER";
  return `+${gap.toFixed(3)}`;
}

// Get team color by constructor name
export function getTeamColor(team: string): string {
  const colors: Record<string, string> = {
    // 2026 grid
    "Red Bull Racing": "#3671C6",
    "Red Bull": "#3671C6",
    "Mercedes": "#27F4D2",
    "Ferrari": "#E8002D",
    "McLaren": "#FF8000",
    "Aston Martin": "#229971",
    "Alpine": "#FF87BC",
    "Alpine F1 Team": "#FF87BC",
    "Williams": "#64C4FF",
    "RB F1 Team": "#6692FF",
    "Racing Bulls": "#6692FF",
    "RB": "#6692FF",
    "Haas F1 Team": "#B6BABD",
    "Haas": "#B6BABD",
    "Audi": "#00E701",
    "Cadillac F1 Team": "#1E3D6B",
    "Cadillac": "#1E3D6B",
    // Legacy teams
    "AlphaTauri": "#6692FF",
    "Alfa Romeo": "#C92D4B",
    "Kick Sauber": "#52E252",
    "Racing Point": "#F596C8",
    "Renault": "#FFF500",
    "Toro Rosso": "#469BFF",
    "Force India": "#F596C8",
  };
  return colors[team] || "#888888";
}

// Get tire compound color
export function getTireColor(compound: string): string {
  const colors: Record<string, string> = {
    SOFT: "#FF3333",
    MEDIUM: "#FFC906",
    HARD: "#FFFFFF",
    INTERMEDIATE: "#39B54A",
    WET: "#0067FF",
    UNKNOWN: "#888888",
  };
  return colors[compound?.toUpperCase()] || "#888888";
}

// Driver abbreviation mapping
export function getDriverAbbrev(name: string): string {
  const map: Record<string, string> = {
    "Max Verstappen": "VER",
    "Lewis Hamilton": "HAM",
    "Charles Leclerc": "LEC",
    "Lando Norris": "NOR",
    "Carlos Sainz": "SAI",
    "Oscar Piastri": "PIA",
    "George Russell": "RUS",
    "Fernando Alonso": "ALO",
    "Pierre Gasly": "GAS",
    "Esteban Ocon": "OCO",
    "Sergio Perez": "PER",
    "Alexander Albon": "ALB",
    "Yuki Tsunoda": "TSU",
    "Daniel Ricciardo": "RIC",
    "Lance Stroll": "STR",
    "Valtteri Bottas": "BOT",
    "Zhou Guanyu": "ZHO",
    "Kevin Magnussen": "MAG",
    "Nico Hulkenberg": "HUL",
    "Logan Sargeant": "SAR",
    "Liam Lawson": "LAW",
    "Oliver Bearman": "BEA",
    "Andrea Kimi Antonelli": "ANT",
    "Kimi Antonelli": "ANT",
    "Jack Doohan": "DOO",
    "Isack Hadjar": "HAD",
    "Gabriel Bortoleto": "BOR",
    "Franco Colapinto": "COL",
    "Arvid Lindblad": "LIN",
  };
  return map[name] || name.substring(0, 3).toUpperCase();
}

// Number formatting
export function formatNumber(num: number): string {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

// Speed formatting
export function formatSpeed(kph: number): string {
  return `${Math.round(kph)} km/h`;
}
