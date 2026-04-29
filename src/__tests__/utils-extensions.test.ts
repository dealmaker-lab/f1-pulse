import { describe, it, expect } from "vitest";
import { intervalColorClass } from "@/lib/utils";

describe("intervalColorClass", () => {
  it("returns amber for null", () => {
    expect(intervalColorClass(null)).toBe("text-racing-amber/50");
  });

  it("returns amber for undefined", () => {
    expect(intervalColorClass(undefined as unknown as number)).toBe("text-racing-amber/50");
  });

  it("returns green when interval < 1 (closing on rival)", () => {
    expect(intervalColorClass(0.5)).toBe("text-racing-green");
    expect(intervalColorClass(0)).toBe("text-racing-green");
    expect(intervalColorClass(0.99)).toBe("text-racing-green");
  });

  it("returns red when interval > 3 (falling back)", () => {
    expect(intervalColorClass(3.5)).toBe("text-racing-red/60");
    expect(intervalColorClass(10)).toBe("text-racing-red/60");
  });

  it("returns amber in the middle band (1 ≤ interval ≤ 3)", () => {
    expect(intervalColorClass(2)).toBe("text-racing-amber/50");
    expect(intervalColorClass(1.5)).toBe("text-racing-amber/50");
  });

  it("interval = 1 boundary is amber (not green)", () => {
    expect(intervalColorClass(1)).toBe("text-racing-amber/50");
  });

  it("interval = 3 boundary is amber (not red)", () => {
    expect(intervalColorClass(3)).toBe("text-racing-amber/50");
  });
});
