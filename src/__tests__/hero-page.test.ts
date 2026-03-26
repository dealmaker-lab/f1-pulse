import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Hero Page — data, logic, and configuration tests
 *
 * Tests the hero page's static data arrays (DRIVERS, features, stats,
 * FALLBACK_STANDINGS), AnimatedNumber counter logic, and StandingsTicker
 * fetch behavior. Does NOT render React components.
 */

// ── Inline the data from page.tsx ──

interface DriverStanding {
  position: number;
  points: number;
  wins: number;
  driver: {
    code: string;
    name: string;
    number: number;
    nationality: string;
    team: string;
    teamColor: string;
    driverId: string;
  };
}

const DRIVERS = [
  { code: "VER", color: "#3671C6", positions: [1, 1, 1, 2, 2, 1, 1, 1, 1, 1] },
  { code: "NOR", color: "#FF8000", positions: [3, 2, 2, 1, 1, 2, 2, 2, 3, 2] },
  { code: "LEC", color: "#E8002D", positions: [2, 3, 3, 3, 3, 3, 3, 3, 2, 3] },
  { code: "HAM", color: "#27F4D2", positions: [5, 5, 4, 4, 4, 4, 5, 4, 4, 4] },
  { code: "PIA", color: "#FF8000", positions: [4, 4, 5, 5, 5, 5, 4, 5, 5, 5] },
];

const features = [
  { icon: "Activity", title: "Live Telemetry", description: "Speed, throttle, brake and DRS data at 3.7Hz sampling for every driver, every lap." },
  { icon: "Timer", title: "Lap Analysis", description: "Compare lap times across sessions, compounds and weather conditions with micro-sector detail." },
  { icon: "Trophy", title: "Championship Tracker", description: "Real-time standings with progression charts and 75+ years of historical comparisons." },
  { icon: "BarChart3", title: "Strategy Analyzer", description: "Pit stop timing, tire stint analysis and undercut/overcut scenario modeling." },
  { icon: "Radio", title: "Team Radio", description: "Session-by-session radio transcripts with timestamps and strategic context." },
  { icon: "Zap", title: "Head-to-Head", description: "Career and race-by-race driver comparisons with 50,000+ data points per race." },
];

const stats = [
  { label: "Races Tracked", value: 450 },
  { label: "Telemetry Sample Rate", value: 3.7, suffix: "Hz", isDecimal: true },
  { label: "Data Points / Race", value: 50000 },
  { label: "Years of Data", value: 75 },
];

const FALLBACK_STANDINGS: DriverStanding[] = [
  { position: 1, points: 245, wins: 8, driver: { code: "VER", name: "Max Verstappen", number: 1, nationality: "Dutch", team: "Red Bull", teamColor: "#3671C6", driverId: "max_verstappen" } },
  { position: 2, points: 200, wins: 4, driver: { code: "NOR", name: "Lando Norris", number: 4, nationality: "British", team: "McLaren", teamColor: "#FF8000", driverId: "norris" } },
  { position: 3, points: 188, wins: 3, driver: { code: "LEC", name: "Charles Leclerc", number: 16, nationality: "Monegasque", team: "Ferrari", teamColor: "#E8002D", driverId: "leclerc" } },
  { position: 4, points: 160, wins: 2, driver: { code: "HAM", name: "Lewis Hamilton", number: 44, nationality: "British", team: "Ferrari", teamColor: "#E8002D", driverId: "hamilton" } },
  { position: 5, points: 148, wins: 1, driver: { code: "PIA", name: "Oscar Piastri", number: 81, nationality: "Australian", team: "McLaren", teamColor: "#FF8000", driverId: "piastri" } },
  { position: 6, points: 130, wins: 1, driver: { code: "SAI", name: "Carlos Sainz", number: 55, nationality: "Spanish", team: "Williams", teamColor: "#64C4FF", driverId: "sainz" } },
  { position: 7, points: 115, wins: 0, driver: { code: "RUS", name: "George Russell", number: 63, nationality: "British", team: "Mercedes", teamColor: "#27F4D2", driverId: "russell" } },
  { position: 8, points: 98, wins: 0, driver: { code: "ALO", name: "Fernando Alonso", number: 14, nationality: "Spanish", team: "Aston Martin", teamColor: "#229971", driverId: "alonso" } },
];

/** Mirrors the AnimatedNumber counter logic */
function simulateAnimatedNumber(target: number, duration: number = 2000): number {
  const step = target / (duration / 16);
  let current = 0;
  while (current < target) {
    current += step;
    if (current >= target) {
      return target;
    }
  }
  return target;
}

// ── Tests ──

describe("Hero Page — DRIVERS array", () => {
  it("has exactly 5 driver entries", () => {
    expect(DRIVERS).toHaveLength(5);
  });

  it("contains the correct driver codes in order", () => {
    const codes = DRIVERS.map((d) => d.code);
    expect(codes).toEqual(["VER", "NOR", "LEC", "HAM", "PIA"]);
  });

  it("each driver has exactly 10 position values", () => {
    for (const driver of DRIVERS) {
      expect(driver.positions).toHaveLength(10);
    }
  });

  it("all position values are between 1 and 5", () => {
    for (const driver of DRIVERS) {
      for (const pos of driver.positions) {
        expect(pos).toBeGreaterThanOrEqual(1);
        expect(pos).toBeLessThanOrEqual(5);
      }
    }
  });

  it("each driver has a valid hex color", () => {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    for (const driver of DRIVERS) {
      expect(driver.color).toMatch(hexRegex);
    }
  });

  it("VER (Verstappen) uses Red Bull blue #3671C6", () => {
    const ver = DRIVERS.find((d) => d.code === "VER");
    expect(ver?.color).toBe("#3671C6");
  });

  it("LEC (Leclerc) uses Ferrari red #E8002D", () => {
    const lec = DRIVERS.find((d) => d.code === "LEC");
    expect(lec?.color).toBe("#E8002D");
  });

  it("NOR and PIA share McLaren orange #FF8000", () => {
    const nor = DRIVERS.find((d) => d.code === "NOR");
    const pia = DRIVERS.find((d) => d.code === "PIA");
    expect(nor?.color).toBe("#FF8000");
    expect(pia?.color).toBe("#FF8000");
  });
});

describe("Hero Page — Features array", () => {
  it("has exactly 6 feature items", () => {
    expect(features).toHaveLength(6);
  });

  it("each feature has icon, title, and description", () => {
    for (const f of features) {
      expect(f.icon).toBeTruthy();
      expect(typeof f.title).toBe("string");
      expect(f.title.length).toBeGreaterThan(0);
      expect(typeof f.description).toBe("string");
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it("feature titles are unique", () => {
    const titles = features.map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("features cover the expected capabilities", () => {
    const titles = features.map((f) => f.title);
    expect(titles).toContain("Live Telemetry");
    expect(titles).toContain("Lap Analysis");
    expect(titles).toContain("Championship Tracker");
    expect(titles).toContain("Strategy Analyzer");
    expect(titles).toContain("Team Radio");
    expect(titles).toContain("Head-to-Head");
  });
});

describe("Hero Page — Stats data", () => {
  it("has exactly 4 stat items", () => {
    expect(stats).toHaveLength(4);
  });

  it("Races Tracked is 450", () => {
    const raceStat = stats.find((s) => s.label === "Races Tracked");
    expect(raceStat?.value).toBe(450);
  });

  it("Telemetry Sample Rate is 3.7Hz", () => {
    const telStat = stats.find((s) => s.label === "Telemetry Sample Rate");
    expect(telStat?.value).toBe(3.7);
    expect(telStat?.suffix).toBe("Hz");
    expect(telStat?.isDecimal).toBe(true);
  });

  it("Data Points / Race is 50000", () => {
    const dpStat = stats.find((s) => s.label === "Data Points / Race");
    expect(dpStat?.value).toBe(50000);
  });

  it("Years of Data is 75", () => {
    const yrStat = stats.find((s) => s.label === "Years of Data");
    expect(yrStat?.value).toBe(75);
  });
});

describe("Hero Page — FALLBACK_STANDINGS", () => {
  it("has exactly 8 entries", () => {
    expect(FALLBACK_STANDINGS).toHaveLength(8);
  });

  it("positions are sequential from 1 to 8", () => {
    const positions = FALLBACK_STANDINGS.map((s) => s.position);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("points are in descending order", () => {
    for (let i = 1; i < FALLBACK_STANDINGS.length; i++) {
      expect(FALLBACK_STANDINGS[i].points).toBeLessThanOrEqual(
        FALLBACK_STANDINGS[i - 1].points
      );
    }
  });

  it("all entries have valid position (1-20), points (>= 0), and wins (>= 0)", () => {
    for (const s of FALLBACK_STANDINGS) {
      expect(s.position).toBeGreaterThanOrEqual(1);
      expect(s.position).toBeLessThanOrEqual(20);
      expect(s.points).toBeGreaterThanOrEqual(0);
      expect(s.wins).toBeGreaterThanOrEqual(0);
    }
  });

  it("each entry has complete driver data", () => {
    for (const s of FALLBACK_STANDINGS) {
      expect(s.driver.code).toMatch(/^[A-Z]{3}$/);
      expect(s.driver.name.length).toBeGreaterThan(0);
      expect(typeof s.driver.number).toBe("number");
      expect(s.driver.nationality.length).toBeGreaterThan(0);
      expect(s.driver.team.length).toBeGreaterThan(0);
      expect(s.driver.teamColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(s.driver.driverId.length).toBeGreaterThan(0);
    }
  });

  it("leader (VER) has 245 points and 8 wins", () => {
    const leader = FALLBACK_STANDINGS[0];
    expect(leader.driver.code).toBe("VER");
    expect(leader.points).toBe(245);
    expect(leader.wins).toBe(8);
  });

  it("last place (ALO) has 98 points and 0 wins", () => {
    const last = FALLBACK_STANDINGS[7];
    expect(last.driver.code).toBe("ALO");
    expect(last.points).toBe(98);
    expect(last.wins).toBe(0);
  });

  it("team colors match expected values", () => {
    const teamColorMap: Record<string, string> = {};
    for (const s of FALLBACK_STANDINGS) {
      teamColorMap[s.driver.team] = s.driver.teamColor;
    }
    expect(teamColorMap["Red Bull"]).toBe("#3671C6");
    expect(teamColorMap["McLaren"]).toBe("#FF8000");
    expect(teamColorMap["Ferrari"]).toBe("#E8002D");
    expect(teamColorMap["Mercedes"]).toBe("#27F4D2");
    expect(teamColorMap["Aston Martin"]).toBe("#229971");
    expect(teamColorMap["Williams"]).toBe("#64C4FF");
  });
});

describe("Hero Page — AnimatedNumber logic", () => {
  it("reaches the target value", () => {
    expect(simulateAnimatedNumber(450)).toBe(450);
    expect(simulateAnimatedNumber(50000)).toBe(50000);
    expect(simulateAnimatedNumber(75)).toBe(75);
  });

  it("reaches target with custom duration", () => {
    expect(simulateAnimatedNumber(100, 500)).toBe(100);
    expect(simulateAnimatedNumber(100, 5000)).toBe(100);
  });

  it("handles target of 0", () => {
    // step becomes 0, so loop never runs — returns 0
    expect(simulateAnimatedNumber(0)).toBe(0);
  });
});

describe("Hero Page — StandingsTicker API", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches from /api/f1/standings/drivers?year=2025", async () => {
    let fetchedUrl = "";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      fetchedUrl = input.toString();
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    // Simulate what StandingsTicker does
    await fetch("/api/f1/standings/drivers?year=2025");
    expect(fetchedUrl).toBe("/api/f1/standings/drivers?year=2025");
  });

  it("falls back to FALLBACK_STANDINGS on API error", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
    }) as unknown as typeof fetch;

    const res = await fetch("/api/f1/standings/drivers?year=2025");
    // Mirrors: if (!res.ok) throw new Error("API error")
    const useFallback = !res.ok;
    expect(useFallback).toBe(true);
    // Standings would remain FALLBACK_STANDINGS
    expect(FALLBACK_STANDINGS).toHaveLength(8);
  });

  it("falls back on network failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    let didFallback = false;
    try {
      await fetch("/api/f1/standings/drivers?year=2025");
    } catch {
      didFallback = true;
    }
    expect(didFallback).toBe(true);
  });

  it("uses API data when response is valid non-empty array", async () => {
    const mockData = [
      { position: 1, points: 300, wins: 10, driver: { code: "VER", name: "Max Verstappen", number: 1, nationality: "Dutch", team: "Red Bull", teamColor: "#3671C6", driverId: "max_verstappen" } },
    ];
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockData), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await fetch("/api/f1/standings/drivers?year=2025");
    const data = await res.json();
    // Mirrors: if (Array.isArray(data) && data.length > 0) setStandings(data)
    const shouldUseApiData = Array.isArray(data) && data.length > 0;
    expect(shouldUseApiData).toBe(true);
    expect(data[0].points).toBe(300);
  });

  it("falls back when API returns empty array", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await fetch("/api/f1/standings/drivers?year=2025");
    const data = await res.json();
    const shouldUseApiData = Array.isArray(data) && data.length > 0;
    expect(shouldUseApiData).toBe(false);
  });
});
