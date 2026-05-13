import { NextResponse } from "next/server";
import { getRainFrames } from "@/lib/rainviewer";

/**
 * GET /api/weather/rain-radar
 *
 * Proxies the RainViewer past-radar metadata so the browser doesn't hit
 * RainViewer directly. Keeps third-party usage centralized, lets us cache
 * (5-minute revalidate matches their 10-min frame cadence), and gives us
 * a single place to swap providers later if needed.
 *
 * Response shape (200):
 *   { frames: Array<{ time: number; path: string }>, host: string }
 *
 * Returns an empty `frames` array when upstream is unavailable rather than
 * a non-200 — the overlay shows a "Radar unavailable" state without taking
 * down the rest of the weather page.
 */

const RAINVIEWER_HOST = "https://tilecache.rainviewer.com";

export const revalidate = 300;

export async function GET() {
  const frames = await getRainFrames();
  return NextResponse.json({ frames, host: RAINVIEWER_HOST });
}
