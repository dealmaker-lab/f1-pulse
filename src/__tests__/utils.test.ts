import { describe, it, expect } from "vitest";
import { formatLapTime, formatGap, getTeamColor, getTireColor } from "@/lib/utils";

describe("formatLapTime", () => {
  it("formats seconds to M:SS.mmm", () => {
    expect(formatLapTime(90.123)).toBe("1:30.123");
  });

  it("pads seconds correctly", () => {
    expect(formatLapTime(61.5)).toBe("1:01.500");
  });

  it("handles sub-minute times", () => {
    expect(formatLapTime(45.678)).toBe("0:45.678");
  });

  it("returns placeholder for null", () => {
    expect(formatLapTime(null)).toBe("--:--.---");
  });

  it("returns placeholder for undefined", () => {
    expect(formatLapTime(undefined as any)).toBe("--:--.---");
  });

  it("handles exact minute boundary", () => {
    expect(formatLapTime(60.0)).toBe("1:00.000");
  });

  it("handles very fast laps", () => {
    expect(formatLapTime(75.321)).toBe("1:15.321");
  });
});

describe("formatGap", () => {
  it("shows LEADER for zero gap", () => {
    expect(formatGap(0)).toBe("LEADER");
  });

  it("formats positive gap with + prefix", () => {
    expect(formatGap(1.234)).toBe("+1.234");
  });

  it("returns empty string for null", () => {
    expect(formatGap(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatGap(undefined as any)).toBe("");
  });

  it("formats small gaps", () => {
    expect(formatGap(0.05)).toBe("+0.050");
  });
});

describe("getTeamColor", () => {
  it("returns Red Bull color", () => {
    expect(getTeamColor("Red Bull Racing")).toBe("#3671C6");
    expect(getTeamColor("Red Bull")).toBe("#3671C6");
  });

  it("returns Ferrari color", () => {
    expect(getTeamColor("Ferrari")).toBe("#E8002D");
  });

  it("returns McLaren color", () => {
    expect(getTeamColor("McLaren")).toBe("#FF8000");
  });

  it("returns Mercedes color", () => {
    expect(getTeamColor("Mercedes")).toBe("#27F4D2");
  });

  it("returns default for unknown teams", () => {
    expect(getTeamColor("Unknown Team")).toBe("#888888");
  });

  it("handles legacy team names", () => {
    expect(getTeamColor("AlphaTauri")).toBe("#6692FF");
  });
});

describe("getTireColor", () => {
  it("returns soft tire color", () => {
    expect(getTireColor("SOFT")).toBe("#FF3333");
  });

  it("returns medium tire color", () => {
    expect(getTireColor("MEDIUM")).toBe("#FFC906");
  });

  it("returns hard tire color", () => {
    expect(getTireColor("HARD")).toBe("#FFFFFF");
  });
});
