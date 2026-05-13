"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, CloudRain } from "lucide-react";
import { cn } from "@/lib/utils";
import { latLonToTile, tileUrl, type RainFrame } from "@/lib/rainviewer";

interface RainOverlayProps {
  /** Circuit latitude (decimal degrees). */
  lat: number;
  /** Circuit longitude (decimal degrees). */
  lon: number;
  /** Overlay opacity, 0..1. Default 0.55 — readable over the dark circuit map. */
  opacity?: number;
  className?: string;
}

/** Web Mercator zoom level. Free tier caps at 7; 6 gives ~50km/tile, enough
 *  to see weather systems sweeping a circuit without losing local detail. */
const ZOOM = 6;
/** Square tile size in pixels — must match the value embedded in tileUrl(). */
const TILE_PX = 256;
/** Grid edge length (3x3 = 768x768). Wider grids would push past mobile width. */
const GRID = 3;
/** Animation step in ms. RainViewer frames are 10 min apart; 500ms reads
 *  as a smooth time-lapse without looking jittery. */
const FRAME_INTERVAL_MS = 500;

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; frames: RainFrame[] };

/**
 * Formats a Unix-seconds timestamp as relative time ("3 min ago", "just now").
 * Frames are at most ~2 hours old so we keep this minimal — no hours/days.
 */
function relativeTime(timeSec: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - timeSec));
  if (diffSec < 30) return "just now";
  const mins = Math.round(diffSec / 60);
  if (mins < 1) return "just now";
  return `${mins} min ago`;
}

/**
 * Animated RainViewer past-radar tile overlay, centered on a circuit.
 *
 * Renders a 3x3 grid of 256x256 PNG tiles at Web Mercator zoom 6, cycling
 * through the 12 most recent radar frames at 500ms each. The overlay does
 * NOT include a basemap — it's designed to sit in a card on the weather
 * page next to the existing forecast widget, not on top of the circuit map.
 *
 * Failure modes:
 * - API down → "Radar unavailable" empty state
 * - No frames in past array → "Radar unavailable"
 * - Individual tile 404 → browser hides broken img (we don't gate on errors)
 */
export default function RainOverlay({
  lat,
  lon,
  opacity = 0.55,
  className,
}: RainOverlayProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch frame metadata once on mount (and again if lat/lon swap to a
  // new circuit — `/api/weather/rain-radar` itself is shared, but a new
  // mount feels safer than gambling on the cache).
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch("/api/weather/rain-radar")
      .then((r) => r.json())
      .then((data: { frames?: RainFrame[] }) => {
        if (cancelled) return;
        const frames = Array.isArray(data.frames) ? data.frames : [];
        if (!frames.length) {
          setState({ kind: "empty" });
          return;
        }
        setState({ kind: "ready", frames });
        // Start on the most recent frame so the first paint shows
        // "now" — animation will loop back to oldest.
        setFrameIdx(frames.length - 1);
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "empty" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Animation tick. Held in a ref so play/pause toggles don't restart the
  // effect (which would also re-run on every frameIdx change otherwise).
  useEffect(() => {
    if (state.kind !== "ready" || !playing) return;
    const frames = state.frames;
    timerRef.current = setInterval(() => {
      setFrameIdx((i) => (i + 1) % frames.length);
    }, FRAME_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [state, playing]);

  // Center tile + 8 neighbors. Computing once per (lat, lon) avoids work
  // on every frame change — the grid is fixed, only the frame path moves.
  const tileGrid = useMemo(() => {
    const center = latLonToTile(lat, lon, ZOOM);
    const offset = Math.floor(GRID / 2);
    const cells: Array<{ x: number; y: number; col: number; row: number }> = [];
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        cells.push({
          x: center.x + (col - offset),
          y: center.y + (row - offset),
          col,
          row,
        });
      }
    }
    return cells;
  }, [lat, lon]);

  // ===== Render branches =====
  if (state.kind === "loading") {
    return (
      <div
        className={cn(
          "relative aspect-square w-full max-w-[768px] mx-auto",
          "rounded-xl overflow-hidden border border-[var(--f1-border)]",
          "bg-[var(--f1-hover)]",
          className,
        )}
      >
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-px">
          {Array.from({ length: GRID * GRID }).map((_, i) => (
            <div
              key={i}
              className="bg-[var(--f1-card)] animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div
        className={cn(
          "relative aspect-square w-full max-w-[768px] mx-auto",
          "rounded-xl overflow-hidden border border-[var(--f1-border)]",
          "bg-[var(--f1-hover)]",
          "flex flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <CloudRain className="w-8 h-8 text-f1-muted" />
        <p className="text-sm text-f1-muted">Radar unavailable</p>
      </div>
    );
  }

  const frame = state.frames[frameIdx];

  return (
    <div
      className={cn(
        "relative aspect-square w-full max-w-[768px] mx-auto",
        "rounded-xl overflow-hidden border border-[var(--f1-border)]",
        "bg-[var(--f1-hover)]",
        className,
      )}
    >
      {/* Tile grid — absolutely positioned by col/row, percentage-sized to
          scale with the container on mobile. Tiles are unoptimized PNGs
          from a third-party CDN, so we use <img> directly — Next/Image
          would block on remote pattern config + slow tile loads. */}
      <div className="absolute inset-0" style={{ opacity }}>
        {tileGrid.map((cell) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${cell.col}-${cell.row}`}
            src={tileUrl(frame, ZOOM, cell.x, cell.y)}
            alt=""
            width={TILE_PX}
            height={TILE_PX}
            className="absolute"
            style={{
              left: `${(cell.col / GRID) * 100}%`,
              top: `${(cell.row / GRID) * 100}%`,
              width: `${100 / GRID}%`,
              height: `${100 / GRID}%`,
            }}
            // RainViewer occasionally 404s for tiles in ocean regions —
            // hide the broken-image icon rather than gate render on it.
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        ))}
      </div>

      {/* Crosshair marking circuit center — sits above the tiles but below
          the controls. Pointer-events-none so it never blocks the toggle. */}
      <div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        aria-hidden="true"
      >
        <div className="w-3 h-3 rounded-full bg-racing-red ring-2 ring-white/70 shadow-lg" />
      </div>

      {/* Timestamp badge */}
      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 font-mono text-[11px] text-white flex items-center gap-1.5">
        <CloudRain className="w-3 h-3 text-racing-blue" />
        {relativeTime(frame.time)}
      </div>

      {/* Frame progress indicator — tiny dot strip so users see where they
          are in the loop without us building a full scrubber. */}
      <div className="absolute bottom-3 left-3 right-16 flex gap-1 items-center">
        {state.frames.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i === frameIdx ? "bg-racing-blue" : "bg-white/20",
            )}
          />
        ))}
      </div>

      {/* Play/pause toggle */}
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause radar animation" : "Play radar animation"}
        className={cn(
          "absolute bottom-3 right-3 w-9 h-9 rounded-full",
          "bg-black/60 backdrop-blur-sm border border-white/10",
          "flex items-center justify-center text-white",
          "hover:bg-black/80 transition-colors cursor-pointer",
        )}
      >
        {playing ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4" fill="currentColor" />
        )}
      </button>
    </div>
  );
}
