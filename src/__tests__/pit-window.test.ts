import { describe, it, expect } from "vitest";
import { getPitLoss, projectPitWindow } from "@/lib/pit-window";

describe("getPitLoss", () => {
  it("returns 24 for Monaco (monte-carlo)", () => {
    expect(getPitLoss("monte-carlo")).toBe(24);
  });

  it("returns 21 for Monza", () => {
    expect(getPitLoss("monza")).toBe(21);
  });

  it("returns 22 for unknown circuits (default)", () => {
    expect(getPitLoss("imaginary-track")).toBe(22);
    expect(getPitLoss("")).toBe(22);
  });

  it("is case-insensitive", () => {
    expect(getPitLoss("MONACO".toLowerCase().replace("monaco", "monte-carlo"))).toBe(24);
    expect(getPitLoss("MONZA")).toBe(21);
    expect(getPitLoss("Monza")).toBe(21);
  });

  it("handles spaces and underscores by hyphenation", () => {
    expect(getPitLoss("monte carlo")).toBe(24);
    expect(getPitLoss("monte_carlo")).toBe(24);
    expect(getPitLoss("MONTE CARLO")).toBe(24);
  });
});

describe("projectPitWindow", () => {
  it("with high tireDegPerLap and many laps remaining → isUndercut=true", () => {
    const result = projectPitWindow({
      currentGapToLeader: 5,
      lapsRemaining: 30,
      circuitShortName: "monza",
      tireDegPerLap: 1.0,
    });
    expect(result.isUndercut).toBe(true);
  });

  it("with rivalDegPerLap > tireDegPerLap → isOvercut=true", () => {
    // Make undercut not trigger by using a small gap and few laps remaining
    // so projectedGap > currentGap, then check overcut signal.
    const result = projectPitWindow({
      currentGapToLeader: 5,
      lapsRemaining: 0, // no laps remaining → projectedGap === gapAfterPit > currentGap
      circuitShortName: "monza",
      tireDegPerLap: 0.05,
      rivalDegPerLap: 0.3,
    });
    // With 0 laps remaining the closing math is zero either way; force
    // a positive lapsRemaining to actually exercise overcut.
    const result2 = projectPitWindow({
      currentGapToLeader: 30,
      lapsRemaining: 5,
      circuitShortName: "monza",
      tireDegPerLap: 0.05,
      rivalDegPerLap: 0.3,
    });
    expect(result2.isOvercut).toBe(true);
    expect(result2.isUndercut).toBe(false);
    // Sanity: result above with 0 laps is not an overcut (no trajectory).
    expect(result.isOvercut).toBe(false);
  });

  it("pitLossSeconds matches the circuit's table entry", () => {
    const r1 = projectPitWindow({
      currentGapToLeader: 0,
      lapsRemaining: 10,
      circuitShortName: "monte-carlo",
    });
    expect(r1.pitLossSeconds).toBe(24);

    const r2 = projectPitWindow({
      currentGapToLeader: 0,
      lapsRemaining: 10,
      circuitShortName: "monza",
    });
    expect(r2.pitLossSeconds).toBe(21);
  });

  it("zero lapsRemaining → projectedGap === gapAfterPit", () => {
    const r = projectPitWindow({
      currentGapToLeader: 5,
      lapsRemaining: 0,
      circuitShortName: "monza",
      tireDegPerLap: 0.5,
    });
    expect(r.projectedGap).toBe(r.gapAfterPit);
  });

  it("gapAfterPit equals currentGap + pitLossSeconds", () => {
    const r = projectPitWindow({
      currentGapToLeader: 5,
      lapsRemaining: 10,
      circuitShortName: "bahrain",
    });
    expect(r.gapAfterPit).toBe(5 + r.pitLossSeconds);
  });
});
