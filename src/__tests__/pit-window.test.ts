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

// ── projectPitRejoin ──────────────────────────────────────────────────
import { projectPitRejoin } from "@/lib/pit-window";

describe("projectPitRejoin", () => {
  const field = [
    { driverNumber: 1, code: "NOR", gapToLeader: 0 },
    { driverNumber: 12, code: "ANT", gapToLeader: 3.2 },
    { driverNumber: 44, code: "HAM", gapToLeader: 8.5 },
    { driverNumber: 16, code: "LEC", gapToLeader: 24.0 },
    { driverNumber: 3, code: "VER", gapToLeader: 30.5 },
    { driverNumber: 55, code: "SAI", gapToLeader: null }, // lapped — excluded
  ];

  it("inserts the post-stop gap into the field and reads position", () => {
    // ANT pits: 3.2 + 22 = 25.2 → behind LEC (24.0), ahead of VER (30.5) → P4
    const r = projectPitRejoin({
      driverNumber: 12,
      currentGapToLeader: 3.2,
      pitLossSeconds: 22,
      field,
    });
    expect(r).not.toBeNull();
    expect(r!.position).toBe(4);
    expect(r!.carAhead?.code).toBe("LEC");
    expect(r!.carAhead?.margin).toBeCloseTo(1.2, 5);
    expect(r!.carBehind?.code).toBe("VER");
    expect(r!.carBehind?.margin).toBeCloseTo(5.3, 5);
    expect(r!.freeAir).toBe(false); // only 1.2s behind LEC
  });

  it("flags free air when the rejoin gap ahead is >= 2s", () => {
    // HAM pits: 8.5 + 22 = 30.5+? use 24 → 8.5+22=30.5 ties VER... use LEC:
    const r = projectPitRejoin({
      driverNumber: 16,
      currentGapToLeader: 24.0,
      pitLossSeconds: 22,
      field,
    });
    // 46.0 → behind VER (30.5) by 15.5s, last of classified → P5, free air
    expect(r!.position).toBe(5);
    expect(r!.carAhead?.code).toBe("VER");
    expect(r!.freeAir).toBe(true);
    expect(r!.carBehind).toBeNull();
  });

  it("returns null when the field has no usable gaps", () => {
    expect(
      projectPitRejoin({
        driverNumber: 1,
        currentGapToLeader: 0,
        pitLossSeconds: 22,
        field: [{ driverNumber: 1, code: "NOR", gapToLeader: 0 }],
      }),
    ).toBeNull();
  });

  it("leader pitting rejoins behind cars within pit-loss range", () => {
    // NOR pits from the lead: 0 + 22 = 22 → ANT (3.2) and HAM (8.5) are
    // ahead, LEC (24.0) is still behind → P3
    const r = projectPitRejoin({
      driverNumber: 1,
      currentGapToLeader: 0,
      pitLossSeconds: 22,
      field,
    });
    expect(r!.position).toBe(3);
    expect(r!.carAhead?.code).toBe("HAM");
    expect(r!.carAhead?.margin).toBeCloseTo(13.5, 5);
    expect(r!.carBehind?.code).toBe("LEC");
    expect(r!.carBehind?.margin).toBeCloseTo(2.0, 5);
    expect(r!.freeAir).toBe(true); // 13.5s behind HAM
  });
});
