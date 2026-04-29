import { describe, it, expect } from "vitest";
import { buildRaceTrace, buildLapPositions } from "@/lib/race-trace-utils";

describe("buildRaceTrace", () => {
  it("returns empty record for empty input", () => {
    expect(buildRaceTrace([])).toEqual({});
  });

  it("single driver, 3 laps — leader gap is always zero", () => {
    const result = buildRaceTrace([
      { driver_number: 1, lap_number: 1, lap_duration: 90 },
      { driver_number: 1, lap_number: 2, lap_duration: 90 },
      { driver_number: 1, lap_number: 3, lap_duration: 90 },
    ]);
    expect(result[1]).toHaveLength(3);
    expect(result[1].every((p) => p.gapToLeader === 0)).toBe(true);
  });

  it("two drivers diverging — leader keeps zero, slower grows", () => {
    const result = buildRaceTrace([
      { driver_number: 1, lap_number: 1, lap_duration: 90 },
      { driver_number: 1, lap_number: 2, lap_duration: 90 },
      { driver_number: 1, lap_number: 3, lap_duration: 90 },
      { driver_number: 44, lap_number: 1, lap_duration: 91 },
      { driver_number: 44, lap_number: 2, lap_duration: 91 },
      { driver_number: 44, lap_number: 3, lap_duration: 91 },
    ]);
    expect(result[1].map((p) => p.gapToLeader)).toEqual([0, 0, 0]);
    const slow = result[44].map((p) => p.gapToLeader);
    expect(slow[0]).toBeCloseTo(1, 3);
    expect(slow[1]).toBeCloseTo(2, 3);
    expect(slow[2]).toBeCloseTo(3, 3);
  });

  it("skips laps with null lap_duration", () => {
    const result = buildRaceTrace([
      { driver_number: 1, lap_number: 1, lap_duration: 90 },
      { driver_number: 1, lap_number: 2, lap_duration: null },
      { driver_number: 1, lap_number: 3, lap_duration: 90 },
    ]);
    expect(result[1].map((p) => p.lap)).toEqual([1, 3]);
  });

  it("flags pit-lap heuristic when duration > 1.5x median", () => {
    const result = buildRaceTrace([
      { driver_number: 1, lap_number: 1, lap_duration: 90 },
      { driver_number: 1, lap_number: 2, lap_duration: 90 },
      { driver_number: 1, lap_number: 3, lap_duration: 90 },
      { driver_number: 1, lap_number: 4, lap_duration: 90 },
      { driver_number: 1, lap_number: 5, lap_duration: 150 }, // > 90 * 1.5
    ]);
    const pitLap = result[1].find((p) => p.lap === 5);
    expect(pitLap?.pitLap).toBe(true);
    const normal = result[1].find((p) => p.lap === 1);
    expect(normal?.pitLap).toBe(false);
  });
});

describe("buildLapPositions", () => {
  it("returns empty record for empty inputs", () => {
    expect(buildLapPositions([], [])).toEqual({});
  });

  it("forward-fills positions across laps", () => {
    const positions = [
      { driver_number: 1, position: 1, date: "2024-01-01T12:00:00Z" },
    ];
    const laps = [
      { driver_number: 1, lap_number: 1, date_start: "2024-01-01T12:00:01Z" },
      { driver_number: 1, lap_number: 2, date_start: "2024-01-01T12:01:31Z" },
      { driver_number: 1, lap_number: 3, date_start: "2024-01-01T12:03:01Z" },
    ];
    const result = buildLapPositions(positions, laps);
    expect(result[1].map((p) => p.position)).toEqual([1, 1, 1]);
  });

  it("handles position events sorted out of order", () => {
    const positions = [
      { driver_number: 1, position: 2, date: "2024-01-01T12:01:35Z" },
      { driver_number: 1, position: 1, date: "2024-01-01T12:00:00Z" },
    ];
    const laps = [
      { driver_number: 1, lap_number: 1, date_start: "2024-01-01T12:00:01Z" },
      { driver_number: 1, lap_number: 2, date_start: "2024-01-01T12:01:31Z" },
      { driver_number: 1, lap_number: 3, date_start: "2024-01-01T12:03:01Z" },
    ];
    const result = buildLapPositions(positions, laps);
    // Lap 1: pos 1 (only event before lap-1 start). Lap 2: still 1 (event at 12:01:35
    // is AFTER lap-2's start of 12:01:31). Lap 3: 2.
    expect(result[1].map((p) => p.position)).toEqual([1, 1, 2]);
  });
});
