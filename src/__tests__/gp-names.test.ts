import { describe, it, expect } from "vitest";
import { gpNameForCircuit } from "@/lib/gp-names";

/**
 * Real coverage for gp-names (shipped today). The Stewards and Reactions
 * tabs were dead until this mapping existed — FIA docs and r/formula1
 * threads are titled by Grand Prix name, not circuit_short_name.
 */
describe("gpNameForCircuit", () => {
  it("maps OpenF1 circuit_short_name to the official GP name", () => {
    expect(gpNameForCircuit("Spielberg")).toBe("Austrian Grand Prix");
    expect(gpNameForCircuit("Silverstone")).toBe("British Grand Prix");
    expect(gpNameForCircuit("Monza")).toBe("Italian Grand Prix");
    expect(gpNameForCircuit("Yas Marina Circuit")).toBe("Abu Dhabi Grand Prix");
  });

  it("maps the 2026 Madrid venue to the Madrid Grand Prix", () => {
    expect(gpNameForCircuit("Madring")).toBe("Madrid Grand Prix");
    expect(gpNameForCircuit("madrid")).toBe("Madrid Grand Prix");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(gpNameForCircuit("  SPIELBERG  ")).toBe("Austrian Grand Prix");
    expect(gpNameForCircuit("monte carlo")).toBe("Monaco Grand Prix");
  });

  it("falls back to the circuit name for unknown circuits", () => {
    expect(gpNameForCircuit("Nowhere")).toBe("Nowhere");
    expect(gpNameForCircuit("")).toBe("");
  });
});
