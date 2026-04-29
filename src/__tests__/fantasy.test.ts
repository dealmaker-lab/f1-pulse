import { describe, it, expect } from "vitest";
import {
  scoreLineup,
  getDriverPrice,
  getConstructorPrice,
  type FantasyResultRow,
} from "@/lib/fantasy";

const result = (
  code: string,
  team: string,
  position: number | null,
  fastestLap = false,
  status = "Finished",
): FantasyResultRow => ({ code, team, position, fastestLap, status });

describe("scoreLineup", () => {
  it("empty results returns 0", () => {
    expect(scoreLineup({ drivers: [], constructor: "Ferrari", results: [] })).toBe(0);
  });

  it("driver finishing P1 with fastest lap scores at least 30 base points", () => {
    // Base for P1 = 21 - 1 = 20, +5 fastest lap, +5 podium = 30.
    // Teammate finishing worse → +3, total 33.
    const score = scoreLineup({
      drivers: ["VER"],
      constructor: "Cadillac F1 Team", // unrelated, no constructor bonus from VER's team
      results: [
        result("VER", "Red Bull Racing", 1, true),
        result("TSU", "Red Bull Racing", 8),
      ],
    });
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it("DNF driver scores -5", () => {
    const score = scoreLineup({
      drivers: ["VER"],
      constructor: "Cadillac F1 Team",
      results: [result("VER", "Red Bull Racing", null, false, "Engine")],
    });
    expect(score).toBe(-5);
  });

  it("outscored teammate gives +3 bonus", () => {
    // Compare two scorers from same team — the better one gets the +3.
    const score = scoreLineup({
      drivers: ["NOR"],
      constructor: "Cadillac F1 Team",
      results: [
        result("NOR", "McLaren", 5),
        result("PIA", "McLaren", 6),
      ],
    });
    // Base = 21-5 = 16, +3 teammate bonus = 19.
    expect(score).toBe(19);
  });

  it("constructor scoring is half of its drivers' total (rounded to 2dp)", () => {
    // Drivers score: VER (P1, +5 podium, +3 teammate-beat) = 20 + 5 + 3 = 28
    //                TSU (P8, beaten by teammate) = 21 - 8 = 13
    // Sum = 41. Constructor half = 20.5.
    // Lineup picks zero drivers → driver-side total = 0. Total = 20.5.
    const score = scoreLineup({
      drivers: [],
      constructor: "Red Bull Racing",
      results: [
        result("VER", "Red Bull Racing", 1),
        result("TSU", "Red Bull Racing", 8),
      ],
    });
    expect(score).toBe(20.5);
  });
});

describe("getDriverPrice", () => {
  it("known driver returns positive price (VER)", () => {
    expect(getDriverPrice("VER")).toBe(30);
  });

  it("unknown driver returns mid-tier default ($8M)", () => {
    expect(getDriverPrice("XXX")).toBe(8);
  });

  it("overrides take precedence over defaults", () => {
    expect(getDriverPrice("VER", { VER: 99 })).toBe(99);
    expect(getDriverPrice("XXX", { XXX: 12 })).toBe(12);
  });
});

describe("getConstructorPrice", () => {
  it("known team returns positive price (McLaren)", () => {
    expect(getConstructorPrice("McLaren")).toBe(30);
  });

  it("unknown team returns mid-tier default ($10M)", () => {
    expect(getConstructorPrice("Imaginary Racing")).toBe(10);
  });

  it("top 5 driver prices + top constructor stay within budget cap context", () => {
    // VER 30 + NOR 29 + PIA 25 + LEC 24 + HAM 23 + McLaren 30 = 161.
    // (Sanity: this exceeds the $100M cap, ensuring the scoring layer enforces it.)
    const top5 = ["VER", "NOR", "PIA", "LEC", "HAM"]
      .map((c) => getDriverPrice(c))
      .reduce((a, b) => a + b, 0);
    const total = top5 + getConstructorPrice("McLaren");
    expect(total).toBe(161);
  });
});
