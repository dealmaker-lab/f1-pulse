/**
 * RainViewer Weather Maps API helpers.
 *
 * Public, free tier: max zoom 7, PNG raster tiles, no API key. Returns the
 * most recent ~12 past radar frames at 10-minute intervals plus a CDN host
 * for tile downloads. See https://www.rainviewer.com/api/weather-maps-api.html
 *
 * We use this for the animated rain overlay on the weather page — strictly
 * past radar (the free tier has an empty `nowcast` array as of writing).
 */

export interface RainFrame {
  /** Unix seconds — when the radar snapshot was captured. */
  time: number;
  /** Frame path component, combined with host + tile coords for tile URLs. */
  path: string;
}

/** RainViewer CDN host. Stable per the API docs but returned in metadata. */
const RAINVIEWER_HOST = "https://tilecache.rainviewer.com";
const RAINVIEWER_META = "https://api.rainviewer.com/public/weather-maps.json";

/** Tile color palette — 2 = Universal Blue, the cleanest dark-theme readable. */
const TILE_COLOR = 2;
/** `{smooth}_{snow}` — 1_1 = smoothed pixels, snow rendered separately. */
const TILE_OPTIONS = "1_1";
/** Tile size in pixels. RainViewer supports 256 and 512; 256 is wider zoom support. */
const TILE_SIZE = 256;

interface RainViewerMeta {
  version?: string;
  host?: string;
  radar?: {
    past?: Array<{ time?: number; path?: string }>;
    nowcast?: Array<{ time?: number; path?: string }>;
  };
}

/**
 * Fetches the list of available past radar frames from RainViewer.
 *
 * Frames are 10 minutes apart and the API returns ~12 of them. We revalidate
 * every 5 minutes — frames advance every 10, so this guarantees freshness
 * without spamming the upstream. Empty array on any failure (caller renders
 * an empty state rather than crashing).
 */
export async function getRainFrames(): Promise<RainFrame[]> {
  try {
    const res = await fetch(RAINVIEWER_META, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as RainViewerMeta;
    const past = json.radar?.past ?? [];
    // Defensive: filter to entries with both `time` and `path` set. The API
    // is well-behaved today but we don't want a single malformed frame to
    // crash the overlay.
    return past
      .filter(
        (f): f is RainFrame =>
          typeof f.time === "number" && typeof f.path === "string",
      )
      .map((f) => ({ time: f.time, path: f.path }));
  } catch {
    return [];
  }
}

/**
 * Builds a tile URL for the given frame + Web Mercator tile coordinates.
 *
 * Pattern: `{host}{frame.path}/{size}/{z}/{x}/{y}/{color}/{options}.png`
 * - z (zoom): 4–7 on the free tier; we use 6 in the overlay
 * - x, y: integer tile coords from {@link latLonToTile}
 */
export function tileUrl(
  frame: RainFrame,
  z: number,
  x: number,
  y: number,
): string {
  return `${RAINVIEWER_HOST}${frame.path}/${TILE_SIZE}/${z}/${x}/${y}/${TILE_COLOR}/${TILE_OPTIONS}.png`;
}

/**
 * Converts a (lat, lon, zoom) coordinate into Web Mercator tile (x, y).
 *
 * Standard slippy-map tile math — same formula OpenStreetMap, Mapbox, and
 * RainViewer all use. Returns floored integers since tile indexes are
 * integral. Clamps lat to ±85.05° (the Mercator projection's poles).
 */
export function latLonToTile(
  lat: number,
  lon: number,
  zoom: number,
): { x: number; y: number } {
  const n = 2 ** zoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}
