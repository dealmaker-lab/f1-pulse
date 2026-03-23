import { describe, it, expect } from "vitest";
import {
  validateSessionKey,
  validateDriverNumber,
  validateYear,
  validateDriverCode,
  validateCircuitId,
  sanitizeError,
} from "@/lib/api-validation";

describe("validateSessionKey", () => {
  it("returns number for valid positive integer", () => {
    expect(validateSessionKey("9158")).toBe(9158);
  });

  it("returns null for null input", () => {
    expect(validateSessionKey(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(validateSessionKey("")).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(validateSessionKey("-1")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(validateSessionKey("0")).toBeNull();
  });

  it("returns null for non-numeric strings", () => {
    expect(validateSessionKey("abc")).toBeNull();
  });

  it("returns null for floats", () => {
    expect(validateSessionKey("1.5")).toBeNull();
  });

  it("returns null for SQL injection attempts", () => {
    expect(validateSessionKey("1; DROP TABLE")).toBeNull();
  });
});

describe("validateDriverNumber", () => {
  it("returns number for valid car numbers", () => {
    expect(validateDriverNumber("1")).toBe(1);
    expect(validateDriverNumber("44")).toBe(44);
    expect(validateDriverNumber("4")).toBe(4);
  });

  it("returns null for out-of-range numbers", () => {
    expect(validateDriverNumber("1000")).toBeNull();
    expect(validateDriverNumber("0")).toBeNull();
    expect(validateDriverNumber("-5")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(validateDriverNumber("VER")).toBeNull();
  });
});

describe("validateYear", () => {
  it("returns valid year", () => {
    expect(validateYear("2025", 2026)).toBe(2025);
  });

  it("returns fallback for null", () => {
    expect(validateYear(null, 2026)).toBe(2026);
  });

  it("returns fallback for year before 1950", () => {
    expect(validateYear("1900", 2026)).toBe(2026);
  });

  it("returns fallback for invalid input", () => {
    expect(validateYear("abc", 2026)).toBe(2026);
  });

  it("accepts historical years", () => {
    expect(validateYear("1950", 2026)).toBe(1950);
  });
});

describe("validateDriverCode", () => {
  it("accepts 3-letter uppercase codes", () => {
    expect(validateDriverCode("VER")).toBe("VER");
    expect(validateDriverCode("HAM")).toBe("HAM");
  });

  it("accepts driverId format", () => {
    expect(validateDriverCode("max_verstappen")).toBe("max_verstappen");
    expect(validateDriverCode("lewis_hamilton")).toBe("lewis_hamilton");
  });

  it("returns null for empty input", () => {
    expect(validateDriverCode(null)).toBeNull();
    expect(validateDriverCode("")).toBeNull();
  });

  it("returns null for invalid formats", () => {
    // "VER1" has a digit — but actually the regex accepts 2-4 uppercase letters only
    // "a" is valid as a driverId (1 char matching /^[a-z][a-z0-9_]{0,49}$/)
    expect(validateDriverCode("VER1")).toBeNull();
    // Single lowercase letter "a" is actually valid per the regex
    expect(validateDriverCode("a")).toBe("a");
  });

  it("rejects injection attempts", () => {
    expect(validateDriverCode("VER'; DROP TABLE")).toBeNull();
  });
});

describe("validateCircuitId", () => {
  it("accepts valid circuit IDs", () => {
    expect(validateCircuitId("monza")).toBe("monza");
    expect(validateCircuitId("spa-francorchamps")).toBe("spa-francorchamps");
  });

  it("returns null for empty input", () => {
    expect(validateCircuitId(null)).toBeNull();
  });

  it("rejects special characters", () => {
    expect(validateCircuitId("monza; DROP TABLE")).toBeNull();
  });
});

describe("sanitizeError", () => {
  it("strips URLs from error messages", () => {
    const err = new Error("Failed to fetch https://api.openf1.org/v1/laps");
    expect(sanitizeError(err)).not.toContain("https://");
    expect(sanitizeError(err)).toContain("[REDACTED_URL]");
  });

  it("returns generic message for non-Error values", () => {
    expect(sanitizeError("string error")).toBe("An unexpected error occurred");
    expect(sanitizeError(42)).toBe("An unexpected error occurred");
  });
});
