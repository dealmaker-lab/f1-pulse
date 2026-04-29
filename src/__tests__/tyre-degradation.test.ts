import { describe, it, expect } from "vitest";
import {
  fuelCorrectLap,
  buildDegradationCurve,
  fitDegradationSlope,
} from "@/lib/tyre-degradation";

describe("fuelCorrectLap", () => {
  it("lap 1 absorbs the full fuel penalty", () => {
    // total fuel penalty = 110 / total * 0.03 * total = 3.3s
    const totalRaceLaps = 50;
    const fuelEffectPerLap = (110 / totalRaceLaps) * 0.03;
    const expectedPenalty = totalRaceLaps * fuelEffectPerLap; // 3.3
    expect(fuelCorrectLap(90, 1, totalRaceLaps)).toBeCloseTo(90 - expectedPenalty, 5);
  });

  it("last lap has effectively zero fuel penalty (1 lap-ahead worth)", () => {
    const totalRaceLaps = 50;
    const fuelEffectPerLap = (110 / totalRaceLaps) * 0.03;
    expect(fuelCorrectLap(90, 50, totalRaceLaps)).toBeCloseTo(90 - fuelEffectPerLap, 5);
  });

  it("monotonic decrease in correction (corrected time rises) over laps", () => {
    const totalRaceLaps = 50;
    const lap1 = fuelCorrectLap(90, 1, totalRaceLaps);
    const lap25 = fuelCorrectLap(90, 25, totalRaceLaps);
    const lap50 = fuelCorrectLap(90, 50, totalRaceLaps);
    expect(lap1).toBeLessThan(lap25);
    expect(lap25).toBeLessThan(lap50);
  });

  it("returns input lap time for invalid totalRaceLaps", () => {
    expect(fuelCorrectLap(90, 5, 0)).toBe(90);
    expect(fuelCorrectLap(90, 5, NaN)).toBe(90);
  });
});

describe("buildDegradationCurve", () => {
  it("empty stint returns empty array", () => {
    expect(buildDegradationCurve([], 1, 50)).toEqual([]);
  });

  it("drops null lap_duration and the actual pit-out, NOT the wrong lap", () => {
    // First raw lap has null duration (filtered before pit-out detection),
    // second is the real pit-out, then 4 normal laps. The pit-out should be
    // the one we drop, NOT the third lap.
    const stint = [
      { lap_number: 10, lap_duration: null },
      { lap_number: 11, lap_duration: 100 }, // real pit-out (slow)
      { lap_number: 12, lap_duration: 90 },
      { lap_number: 13, lap_duration: 90.5 },
      { lap_number: 14, lap_duration: 91 },
      { lap_number: 15, lap_duration: 100 }, // pit-in
    ];
    const result = buildDegradationCurve(stint, 11, 50);
    // Should drop null (10), pit-out (11), pit-in (15) → keep 12, 13, 14.
    expect(result.map((r) => r.raceLap)).toEqual([12, 13, 14]);
  });

  it("drops first valid lap (pit-out) and last valid lap (pit-in) when stint > 1", () => {
    const stint = [
      { lap_number: 1, lap_duration: 100 }, // pit-out
      { lap_number: 2, lap_duration: 90 },
      { lap_number: 3, lap_duration: 91 },
      { lap_number: 4, lap_duration: 100 }, // pit-in
    ];
    const result = buildDegradationCurve(stint, 1, 50);
    expect(result.map((r) => r.raceLap)).toEqual([2, 3]);
  });

  it("deltaFromStart for the first usable lap is exactly 0", () => {
    const stint = [
      { lap_number: 1, lap_duration: 100 },
      { lap_number: 2, lap_duration: 90 },
      { lap_number: 3, lap_duration: 91 },
      { lap_number: 4, lap_duration: 100 },
    ];
    const result = buildDegradationCurve(stint, 1, 50);
    expect(result[0].deltaFromStart).toBe(0);
  });
});

describe("fitDegradationSlope", () => {
  it("positive slope on a degrading stint", () => {
    const curve = [
      { tireAge: 0, correctedLapTime: 90 },
      { tireAge: 1, correctedLapTime: 90.1 },
      { tireAge: 2, correctedLapTime: 90.2 },
      { tireAge: 3, correctedLapTime: 90.3 },
    ];
    const fit = fitDegradationSlope(curve);
    expect(fit.slope).toBeCloseTo(0.1, 5);
    expect(fit.rSquared).toBeCloseTo(1, 5);
  });

  it("near-zero r² on noisy data without trend", () => {
    // Same y-value repeated → ssTot=0 → returns rSquared=1 by convention.
    // Use small jitter centered on the same value to get low r².
    const curve = [
      { tireAge: 0, correctedLapTime: 90 },
      { tireAge: 1, correctedLapTime: 90.5 },
      { tireAge: 2, correctedLapTime: 89.5 },
      { tireAge: 3, correctedLapTime: 90.4 },
      { tireAge: 4, correctedLapTime: 89.6 },
    ];
    const fit = fitDegradationSlope(curve);
    expect(fit.rSquared).toBeLessThan(0.5);
  });

  it("handles n<2 gracefully", () => {
    expect(fitDegradationSlope([])).toEqual({ slope: 0, rSquared: 0, intercept: 0 });
    const single = fitDegradationSlope([{ tireAge: 0, correctedLapTime: 90 }]);
    expect(single.slope).toBe(0);
    expect(single.rSquared).toBe(0);
    expect(single.intercept).toBe(90);
  });
});
