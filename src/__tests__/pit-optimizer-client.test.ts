import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchPitOptimization,
  PitOptimizerError,
} from "@/lib/pit-optimizer-client";

const baseInput = {
  year: 2025,
  round: 1,
  session: "R" as const,
  driver: "VER",
};

describe("fetchPitOptimization — input validation", () => {
  // Track and restore fetch between tests so accidental network calls during
  // validation-only tests are surfaced as assertion failures.
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    (global as unknown as { fetch: typeof fetchSpy }).fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as unknown as { fetch?: unknown }).fetch;
  });

  it("throws PitOptimizerError(400) when driver is empty", async () => {
    await expect(
      fetchPitOptimization({ ...baseInput, driver: "" }),
    ).rejects.toBeInstanceOf(PitOptimizerError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws PitOptimizerError(400) when session is not R or S", async () => {
    await expect(
      // @ts-expect-error — exercising the runtime guard
      fetchPitOptimization({ ...baseInput, session: "Q" }),
    ).rejects.toMatchObject({
      name: "PitOptimizerError",
      status: 400,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects strategies > 3 before fetching", async () => {
    await expect(
      fetchPitOptimization({ ...baseInput, strategies: 4 }),
    ).rejects.toMatchObject({
      name: "PitOptimizerError",
      status: 400,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects strategies < 1 before fetching", async () => {
    await expect(
      fetchPitOptimization({ ...baseInput, strategies: 0 }),
    ).rejects.toMatchObject({
      name: "PitOptimizerError",
      status: 400,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fetchPitOptimization — fetch + parsing", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    (global as unknown as { fetch: typeof fetchSpy }).fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as unknown as { fetch?: unknown }).fetch;
  });

  it("parses a valid OptimizerResult and re-sorts strategies by rank", async () => {
    const raw = {
      driver: "VER",
      totalLaps: 57,
      strategies: [
        // Intentionally out-of-order; client should re-sort.
        { stops: 2, pitLaps: [18, 38], compounds: ["S", "M", "H"], estimatedTime: 5430.2, rank: 2 },
        { stops: 1, pitLaps: [25], compounds: ["M", "H"], estimatedTime: 5410.1, rank: 1 },
      ],
      baseline: 5400.0,
      saved: -10.1,
      event: "Bahrain Grand Prix",
      pitLoss: 22,
    };
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => raw,
    });

    const result = await fetchPitOptimization(baseInput);
    expect(result.driver).toBe("VER");
    expect(result.totalLaps).toBe(57);
    expect(result.strategies.map((s) => s.rank)).toEqual([1, 2]);
    expect(result.event).toBe("Bahrain Grand Prix");
    expect(result.pitLoss).toBe(22);
  });

  it("uppercases the driver code before sending it upstream", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        driver: "VER",
        totalLaps: 1,
        strategies: [],
        baseline: 0,
        saved: 0,
      }),
    });
    await fetchPitOptimization({ ...baseInput, driver: "ver" });
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("driver=VER");
  });

  it("throws PitOptimizerError with upstream status on 404", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "Driver not in session" }),
    });
    await expect(fetchPitOptimization(baseInput)).rejects.toMatchObject({
      name: "PitOptimizerError",
      status: 404,
      message: "Driver not in session",
    });
  });

  it("throws PitOptimizerError when upstream returns non-JSON", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    await expect(fetchPitOptimization(baseInput)).rejects.toMatchObject({
      name: "PitOptimizerError",
      status: 200,
    });
  });

  it("defaults strategies to 2 when omitted", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        driver: "VER",
        totalLaps: 1,
        strategies: [],
        baseline: 0,
        saved: 0,
      }),
    });
    await fetchPitOptimization(baseInput);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("strategies=2");
  });
});
