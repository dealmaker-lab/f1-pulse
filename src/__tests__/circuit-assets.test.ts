import { describe, it, expect } from "vitest";
import {
  getCircuitSvg,
  CIRCUIT_DISPLAY_NAMES,
  CIRCUIT_SVG_MAP,
} from "@/lib/circuit-assets";

describe("getCircuitSvg — Madring (Madrid) lookups", () => {
  it("resolves the canonical 'madring' key directly", () => {
    const paths = getCircuitSvg("madring");
    expect(paths).not.toBeNull();
    expect(paths?.white).toBe("/circuits/madring-white.svg");
    expect(paths?.outline).toBe("/circuits/madring-white-outline.svg");
  });

  it("resolves 'madrid' via the alias table", () => {
    const paths = getCircuitSvg("madrid");
    expect(paths).not.toBeNull();
    expect(paths?.white).toBe("/circuits/madring-white.svg");
  });

  it("resolves 'Madrid' (mixed case) via the alias table", () => {
    expect(getCircuitSvg("Madrid")?.white).toBe("/circuits/madring-white.svg");
    expect(getCircuitSvg("MADRID")?.white).toBe("/circuits/madring-white.svg");
  });

  it("resolves 'ifema-madring' via fuzzy/alias matching", () => {
    const paths = getCircuitSvg("ifema-madring");
    expect(paths).not.toBeNull();
    expect(paths?.white).toBe("/circuits/madring-white.svg");
  });

  it("resolves additional Madrid aliases (ifema, madridring)", () => {
    expect(getCircuitSvg("ifema")?.white).toBe("/circuits/madring-white.svg");
    expect(getCircuitSvg("madridring")?.white).toBe(
      "/circuits/madring-white.svg",
    );
  });
});

describe("CIRCUIT_DISPLAY_NAMES — Madring entry", () => {
  it("maps madring → 'Circuito de Madrid'", () => {
    expect(CIRCUIT_DISPLAY_NAMES.madring).toBe("Circuito de Madrid");
  });

  it("has a display name for every circuit in CIRCUIT_SVG_MAP", () => {
    for (const key of Object.keys(CIRCUIT_SVG_MAP)) {
      expect(CIRCUIT_DISPLAY_NAMES[key]).toBeTruthy();
    }
  });
});

describe("getCircuitSvg — defensive behaviour", () => {
  it("returns null for nullish / empty input", () => {
    expect(getCircuitSvg(null)).toBeNull();
    expect(getCircuitSvg(undefined)).toBeNull();
    expect(getCircuitSvg("")).toBeNull();
  });
});
