import { describe, it, expect } from "vitest";
import {
  latLonToTile,
  tileUrl,
  getRainFrames,
  type RainFrame,
} from "@/lib/rainviewer";

describe("latLonToTile", () => {
  it("returns integer coordinates (Math.floor)", () => {
    const { x, y } = latLonToTile(43.7347, 7.4206, 6);
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
  });

  it("equator (0, 0) at zoom 6 lands in the middle of the 64x64 tile grid", () => {
    // At zoom 6 there are 2^6 = 64 tiles per axis; (0, 0) lat/lon
    // is the projection origin so the tile is x=32, y=32.
    const { x, y } = latLonToTile(0, 0, 6);
    expect(x).toBe(32);
    expect(y).toBe(32);
  });

  it("zoom 0 collapses every coordinate to tile (0, 0)", () => {
    expect(latLonToTile(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(latLonToTile(43.7347, 7.4206, 0)).toEqual({ x: 0, y: 0 });
    expect(latLonToTile(-33.9, 151.2, 0)).toEqual({ x: 0, y: 0 });
  });

  it("Monaco (43.7347, 7.4206) at zoom 6 lands in the European tile range", () => {
    const { x, y } = latLonToTile(43.7347, 7.4206, 6);
    // Slightly east of Greenwich, in northern hemisphere: x just past center,
    // y just above center. Tight bounds rule out a math regression.
    expect(x).toBeGreaterThanOrEqual(32);
    expect(x).toBeLessThanOrEqual(35);
    expect(y).toBeGreaterThanOrEqual(20);
    expect(y).toBeLessThanOrEqual(25);
  });

  it("clamps latitude beyond ±85.05° (Mercator pole limit)", () => {
    // 89° should clamp to 85.05 and yield the same y as 85.05 directly.
    const { y: clamped } = latLonToTile(89, 0, 6);
    const { y: atLimit } = latLonToTile(85.05112878, 0, 6);
    expect(clamped).toBe(atLimit);

    const { y: clampedNeg } = latLonToTile(-89, 0, 6);
    const { y: atNegLimit } = latLonToTile(-85.05112878, 0, 6);
    expect(clampedNeg).toBe(atNegLimit);
  });
});

describe("tileUrl", () => {
  it("builds the correct slippy-map URL pattern", () => {
    const frame: RainFrame = { time: 1700000000, path: "/v2/radar/1700000000" };
    const url = tileUrl(frame, 6, 32, 22);
    // {host}{frame.path}/{size}/{z}/{x}/{y}/{color}/{options}.png
    expect(url).toBe(
      "https://tilecache.rainviewer.com/v2/radar/1700000000/256/6/32/22/2/1_1.png",
    );
  });

  it("embeds the supplied frame path verbatim", () => {
    const frame: RainFrame = { time: 1, path: "/custom-path" };
    expect(tileUrl(frame, 4, 0, 0)).toContain("/custom-path/");
  });
});

describe("getRainFrames", () => {
  it("is exported as an async function", () => {
    expect(typeof getRainFrames).toBe("function");
    // Async functions have constructor name "AsyncFunction".
    expect(getRainFrames.constructor.name).toBe("AsyncFunction");
  });
});
