import { describe, it, expect } from "vitest";
import { computeMiniSectorBests, type MiniSectorLap } from "@/lib/mini-sectors";

describe("computeMiniSectorBests", () => {
  it("empty laps returns array of nulls of length numMiniSectors", () => {
    const result = computeMiniSectorBests([], 25);
    expect(result).toHaveLength(25);
    expect(result.every((s) => s.fastestDriver === null && s.fastestTime === null)).toBe(true);
    expect(result.map((s) => s.sector)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
  });

  it("single driver dominates all sectors", () => {
    const laps: MiniSectorLap[] = [
      {
        driver_number: 1,
        lap_number: 1,
        duration_sector_1: 30,
        duration_sector_2: 30,
        duration_sector_3: 30,
      },
    ];
    const result = computeMiniSectorBests(laps, 24);
    expect(result.every((s) => s.fastestDriver === 1)).toBe(true);
    expect(result.every((s) => s.fastestTime !== null)).toBe(true);
  });

  it("two drivers split sectors based on proportional sector durations", () => {
    // Driver 1 is fast in S1 (slow elsewhere), Driver 44 is fast in S2 and S3.
    const laps: MiniSectorLap[] = [
      {
        driver_number: 1,
        lap_number: 1,
        duration_sector_1: 20,
        duration_sector_2: 40,
        duration_sector_3: 40,
      },
      {
        driver_number: 44,
        lap_number: 1,
        duration_sector_1: 30,
        duration_sector_2: 25,
        duration_sector_3: 25,
      },
    ];
    const result = computeMiniSectorBests(laps, 24); // [8, 8, 8]
    // First 8 (S1 region): driver 1 (20/8=2.5) beats driver 44 (30/8=3.75)
    expect(result.slice(0, 8).every((s) => s.fastestDriver === 1)).toBe(true);
    // Next 8 (S2 region): driver 44 (25/8) beats driver 1 (40/8)
    expect(result.slice(8, 16).every((s) => s.fastestDriver === 44)).toBe(true);
    // Last 8 (S3 region): driver 44 (25/8) beats driver 1 (40/8)
    expect(result.slice(16, 24).every((s) => s.fastestDriver === 44)).toBe(true);
  });

  it("laps with null sector durations are skipped", () => {
    const laps: MiniSectorLap[] = [
      {
        driver_number: 1,
        lap_number: 1,
        duration_sector_1: null,
        duration_sector_2: 25,
        duration_sector_3: 25,
      },
      {
        driver_number: 44,
        lap_number: 1,
        duration_sector_1: 30,
        duration_sector_2: 30,
        duration_sector_3: 30,
      },
    ];
    const result = computeMiniSectorBests(laps, 24);
    // Driver 1 is skipped due to null S1, so driver 44 wins every slot.
    expect(result.every((s) => s.fastestDriver === 44)).toBe(true);
  });

  it("numMiniSectors=1 produces one entry covering all 3 main sectors", () => {
    const laps: MiniSectorLap[] = [
      {
        driver_number: 1,
        lap_number: 1,
        duration_sector_1: 30,
        duration_sector_2: 30,
        duration_sector_3: 30,
      },
    ];
    const result = computeMiniSectorBests(laps, 1);
    expect(result).toHaveLength(1);
    expect(result[0].fastestDriver).toBe(1);
    expect(result[0].sector).toBe(1);
  });

  it("result length always equals numMiniSectors", () => {
    const laps: MiniSectorLap[] = [
      {
        driver_number: 1,
        lap_number: 1,
        duration_sector_1: 30,
        duration_sector_2: 30,
        duration_sector_3: 30,
      },
    ];
    expect(computeMiniSectorBests(laps, 5)).toHaveLength(5);
    expect(computeMiniSectorBests(laps, 27)).toHaveLength(27);
    expect(computeMiniSectorBests(laps, 50)).toHaveLength(50);
  });
});
