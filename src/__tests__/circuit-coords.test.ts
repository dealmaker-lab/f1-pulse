import { describe, it, expect } from "vitest";
import { getCircuitCoords, CIRCUIT_COORDS } from "@/lib/circuit-coords";

describe("getCircuitCoords", () => {
  it("all 25 circuits in the table return non-null", () => {
    const keys = Object.keys(CIRCUIT_COORDS);
    expect(keys).toHaveLength(25);
    for (const key of keys) {
      expect(getCircuitCoords(key)).not.toBeNull();
    }
  });

  it("resolves OpenF1 circuit_short_name aliases", () => {
    expect(getCircuitCoords("Spielberg")?.label).toBe("Red Bull Ring");
    expect(getCircuitCoords("Sakhir")?.label).toBe("Bahrain");
    expect(getCircuitCoords("Melbourne")?.label).toBe("Melbourne");
    expect(getCircuitCoords("Catalunya")?.label).toBe("Barcelona");
    expect(getCircuitCoords("Austin")?.label).toBe("Austin");
    expect(getCircuitCoords("Lusail")?.label).toBe("Losail");
    expect(getCircuitCoords("Singapore")?.label).toBe("Singapore");
    expect(getCircuitCoords("Yas Marina Circuit")?.label).toBe("Yas Marina");
    expect(getCircuitCoords("Madring")?.label).toBe("Madrid (Madring)");
    expect(getCircuitCoords("madrid")?.label).toBe("Madrid (Madring)");
  });

  it("returns null for unknown circuit names", () => {
    expect(getCircuitCoords("imaginary-track")).toBeNull();
    expect(getCircuitCoords("")).toBeNull();
    expect(getCircuitCoords(undefined)).toBeNull();
  });

  it("tolerates whitespace and casing", () => {
    expect(getCircuitCoords("  monza  ")).not.toBeNull();
    expect(getCircuitCoords("MONZA")).not.toBeNull();
    expect(getCircuitCoords("Monte Carlo")).not.toBeNull();
    expect(getCircuitCoords("YAS MARINA")?.label).toBe("Yas Marina");
  });

  it("lat values are in valid range (-90..90)", () => {
    for (const coord of Object.values(CIRCUIT_COORDS)) {
      expect(coord.lat).toBeGreaterThanOrEqual(-90);
      expect(coord.lat).toBeLessThanOrEqual(90);
    }
  });

  it("lon values are in valid range (-180..180)", () => {
    for (const coord of Object.values(CIRCUIT_COORDS)) {
      expect(coord.lon).toBeGreaterThanOrEqual(-180);
      expect(coord.lon).toBeLessThanOrEqual(180);
    }
  });

  it("each entry has a non-empty tz string", () => {
    for (const coord of Object.values(CIRCUIT_COORDS)) {
      expect(typeof coord.tz).toBe("string");
      expect(coord.tz.length).toBeGreaterThan(0);
      // IANA timezones contain a slash (e.g. "Europe/Rome")
      expect(coord.tz).toContain("/");
    }
  });

  it("each entry has a non-empty label", () => {
    for (const coord of Object.values(CIRCUIT_COORDS)) {
      expect(typeof coord.label).toBe("string");
      expect(coord.label.length).toBeGreaterThan(0);
    }
  });
});

// ── resolveCircuitSlug (shipped today; consumed by Pirelli + predictions) ──
import { resolveCircuitSlug } from "@/lib/circuit-coords";

describe("resolveCircuitSlug", () => {
  it("normalizes OpenF1 circuit_short_name to the canonical slug", () => {
    expect(resolveCircuitSlug("Spielberg")).toBe("red-bull-ring");
    expect(resolveCircuitSlug("Sakhir")).toBe("bahrain");
    expect(resolveCircuitSlug("Catalunya")).toBe("barcelona");
    expect(resolveCircuitSlug("Yas Marina Circuit")).toBe("yas-marina");
    expect(resolveCircuitSlug("Madring")).toBe("madrid");
  });

  it("passes through already-canonical slugs unchanged", () => {
    expect(resolveCircuitSlug("monza")).toBe("monza");
    expect(resolveCircuitSlug("red-bull-ring")).toBe("red-bull-ring");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolveCircuitSlug("  MONTE CARLO  ")).toBe("monte-carlo");
  });
});
