// F1 Team logo URLs and metadata
// Team logos from official F1 media CDN

export interface TeamInfo {
  name: string;
  shortName: string;
  color: string;
  logoUrl: string;
  carUrl?: string;
}

// Map team names (various spellings) to normalized team data
const TEAM_DATA: Record<string, TeamInfo> = {
  // 2025-2026 Grid
  "Red Bull Racing": {
    name: "Red Bull Racing",
    shortName: "Red Bull",
    color: "#3671C6",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/red-bull-racing-logo.png.transform/2col/image.png",
  },
  "Mercedes": {
    name: "Mercedes-AMG Petronas",
    shortName: "Mercedes",
    color: "#27F4D2",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/mercedes-logo.png.transform/2col/image.png",
  },
  "Ferrari": {
    name: "Scuderia Ferrari",
    shortName: "Ferrari",
    color: "#E8002D",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/ferrari-logo.png.transform/2col/image.png",
  },
  "McLaren": {
    name: "McLaren F1 Team",
    shortName: "McLaren",
    color: "#FF8000",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/mclaren-logo.png.transform/2col/image.png",
  },
  "Aston Martin": {
    name: "Aston Martin Aramco",
    shortName: "Aston Martin",
    color: "#229971",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/aston-martin-logo.png.transform/2col/image.png",
  },
  "Alpine": {
    name: "Alpine F1 Team",
    shortName: "Alpine",
    color: "#FF87BC",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/alpine-logo.png.transform/2col/image.png",
  },
  "Williams": {
    name: "Williams Racing",
    shortName: "Williams",
    color: "#64C4FF",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/williams-logo.png.transform/2col/image.png",
  },
  "Racing Bulls": {
    name: "Racing Bulls",
    shortName: "RB",
    color: "#6692FF",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/rb-logo.png.transform/2col/image.png",
  },
  "Haas F1 Team": {
    name: "MoneyGram Haas F1 Team",
    shortName: "Haas",
    color: "#B6BABD",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/haas-logo.png.transform/2col/image.png",
  },
  "Kick Sauber": {
    name: "Stake F1 Team Kick Sauber",
    shortName: "Sauber",
    color: "#52E252",
    logoUrl: "https://media.formula1.com/content/dam/fom-website/teams/2025/kick-sauber-logo.png.transform/2col/image.png",
  },
};

// Aliases for team name matching
const TEAM_ALIASES: Record<string, string> = {
  "Red Bull": "Red Bull Racing",
  "RB F1 Team": "Racing Bulls",
  "RB": "Racing Bulls",
  "Alpine F1 Team": "Alpine",
  "Haas": "Haas F1 Team",
  "Sauber": "Kick Sauber",
  "Alfa Romeo": "Kick Sauber",
  "AlphaTauri": "Racing Bulls",
  "Toro Rosso": "Racing Bulls",
  "Racing Point": "Aston Martin",
  "Force India": "Aston Martin",
  "Renault": "Alpine",
  "Cadillac F1 Team": "Haas F1 Team",
  "Cadillac": "Haas F1 Team",
  "Audi": "Kick Sauber",
};

export function getTeamInfo(teamName: string): TeamInfo | null {
  // Direct match
  if (TEAM_DATA[teamName]) return TEAM_DATA[teamName];
  // Alias match
  const alias = TEAM_ALIASES[teamName];
  if (alias && TEAM_DATA[alias]) return TEAM_DATA[alias];
  // Fuzzy match
  const lower = teamName.toLowerCase();
  for (const [key, data] of Object.entries(TEAM_DATA)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return data;
    }
  }
  return null;
}

export function getTeamLogoUrl(teamName: string): string | null {
  return getTeamInfo(teamName)?.logoUrl || null;
}

export function getTeamShortName(teamName: string): string {
  return getTeamInfo(teamName)?.shortName || teamName.replace(/ F1 Team| Racing/g, "");
}

// Get all unique teams for filtering
export function getAllTeams(): TeamInfo[] {
  return Object.values(TEAM_DATA);
}

// Driver headshot URLs - shared across pages
export const DRIVER_HEADSHOTS: Record<string, string> = {
  VER: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/M/MAXVER01_Max_Verstappen/maxver01.png.transform/1col/image.png",
  HAM: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LEWHAM01_Lewis_Hamilton/lewham01.png.transform/1col/image.png",
  NOR: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LANNOR01_Lando_Norris/lannor01.png.transform/1col/image.png",
  LEC: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/C/CHALEC01_Charles_Leclerc/chalec01.png.transform/1col/image.png",
  SAI: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/C/CARSAI01_Carlos_Sainz/carsai01.png.transform/1col/image.png",
  PIA: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/O/OSCPIA01_Oscar_Piastri/oscpia01.png.transform/1col/image.png",
  RUS: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/G/GEORUS01_George_Russell/georus01.png.transform/1col/image.png",
  ALO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/F/FERALO01_Fernando_Alonso/feralo01.png.transform/1col/image.png",
  PER: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/S/SERPER01_Sergio_Perez/serper01.png.transform/1col/image.png",
  STR: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LANSTR01_Lance_Stroll/lanstr01.png.transform/1col/image.png",
  GAS: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/P/PIEGAS01_Pierre_Gasly/piegas01.png.transform/1col/image.png",
  OCO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/E/ESTOCO01_Esteban_Ocon/estoco01.png.transform/1col/image.png",
  TSU: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/Y/YUKTSU01_Yuki_Tsunoda/yuktsu01.png.transform/1col/image.png",
  ALB: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/A/ALEALB01_Alexander_Albon/alealb01.png.transform/1col/image.png",
  HUL: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/N/NICHUL01_Nico_Hulkenberg/nichul01.png.transform/1col/image.png",
  MAG: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/K/KEVMAG01_Kevin_Magnussen/kevmag01.png.transform/1col/image.png",
  BOT: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/V/VALBOT01_Valtteri_Bottas/valbot01.png.transform/1col/image.png",
  ZHO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/G/GUAZHO01_Guanyu_Zhou/guazho01.png.transform/1col/image.png",
  RIC: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/D/DANRIC01_Daniel_Ricciardo/danric01.png.transform/1col/image.png",
  LAW: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LIALAW01_Liam_Lawson/lialaw01.png.transform/1col/image.png",
  BEA: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/O/OLIBEA01_Oliver_Bearman/olibea01.png.transform/1col/image.png",
  COL: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/F/FRACO01_Franco_Colapinto/fraco01.png.transform/1col/image.png",
  DOO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/J/JACDOO01_Jack_Doohan/jacdoo01.png.transform/1col/image.png",
  ANT: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/A/ANDANT01_Andrea_Kimi_Antonelli/andant01.png.transform/1col/image.png",
  HAD: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/I/ISAHAD01_Isack_Hadjar/isahad01.png.transform/1col/image.png",
  BOR: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/G/GABBO01_Gabriel_Bortoleto/gabbo01.png.transform/1col/image.png",
};

export function getDriverHeadshot(code: string): string | null {
  return DRIVER_HEADSHOTS[code] || null;
}
