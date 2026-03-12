"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { cn, getTeamColor } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface TrackPoint {
  x: number;
  y: number;
}

interface CarPosition {
  driver_number: number;
  x: number;
  y: number;
  date: string;
}

interface DriverInfo {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

interface CircuitMapProps {
  sessionKey: number | null;
  /** Compact mode for hero section — no controls, just the map */
  compact?: boolean;
  /** Circuit name to display */
  circuitName?: string;
  /** Custom height class */
  height?: string;
  /** Highlight specific drivers */
  highlightDrivers?: number[];
  /** Show driver labels */
  showLabels?: boolean;
  /** Custom class */
  className?: string;
}

// Padding ratio around the track
const PADDING = 0.08;
// SVG viewBox dimensions
const SVG_WIDTH = 800;
const SVG_HEIGHT = 500;

/**
 * Converts track coordinates to SVG space.
 * OpenF1 x/y are in meters from some reference point.
 * We normalize them to fit within our SVG viewBox with padding.
 */
function normalizePoints(
  points: TrackPoint[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): { x: number; y: number }[] {
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;

  const padX = spanX * PADDING;
  const padY = spanY * PADDING;

  const totalSpanX = spanX + padX * 2;
  const totalSpanY = spanY + padY * 2;

  // Maintain aspect ratio — fit within SVG dimensions
  const scaleX = SVG_WIDTH / totalSpanX;
  const scaleY = SVG_HEIGHT / totalSpanY;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (SVG_WIDTH - totalSpanX * scale) / 2;
  const offsetY = (SVG_HEIGHT - totalSpanY * scale) / 2;

  return points.map((p) => ({
    x: offsetX + (p.x - bounds.minX + padX) * scale,
    // Flip Y axis (screen Y is inverted from track Y)
    y: SVG_HEIGHT - (offsetY + (p.y - bounds.minY + padY) * scale),
  }));
}

/**
 * Generate a smooth SVG path from points using Catmull-Rom → Cubic Bezier conversion
 */
function pointsToSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";

  // Use Catmull-Rom spline converted to cubic bezier
  const tension = 0.3;
  let path = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return path;
}

export default function CircuitMap({
  sessionKey,
  compact = false,
  circuitName,
  height = "h-[400px]",
  highlightDrivers,
  showLabels = true,
  className,
}: CircuitMapProps) {
  const [trackOutline, setTrackOutline] = useState<TrackPoint[]>([]);
  const [carPositions, setCarPositions] = useState<CarPosition[]>([]);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [bounds, setBounds] = useState<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredDriver, setHoveredDriver] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch track outline and initial positions
  useEffect(() => {
    if (!sessionKey) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/f1/track-map?session_key=${sessionKey}&mode=outline`).then(
        (r) => r.json()
      ),
      fetch(`/api/f1/drivers?session_key=${sessionKey}`).then((r) => r.json()),
    ])
      .then(([mapData, driverData]) => {
        if (mapData.trackOutline?.length > 0) {
          setTrackOutline(mapData.trackOutline);
          setBounds(mapData.bounds);
        } else {
          setError("No track data available for this session");
        }

        if (Array.isArray(driverData)) {
          setDrivers(driverData);
        }
      })
      .catch(() => setError("Failed to load circuit data"))
      .finally(() => setLoading(false));
  }, [sessionKey]);

  // Normalized track path
  const normalizedTrack = useMemo(() => {
    if (!trackOutline.length || !bounds) return [];
    return normalizePoints(trackOutline, bounds);
  }, [trackOutline, bounds]);

  const trackPath = useMemo(
    () => pointsToSmoothPath(normalizedTrack),
    [normalizedTrack]
  );

  // Normalized car positions
  const normalizedCars = useMemo(() => {
    if (!carPositions.length || !bounds) return [];
    const positions = carPositions.filter((p) => p.x !== 0 || p.y !== 0);
    const normalized = normalizePoints(positions, bounds);
    return positions.map((p, i) => ({
      ...p,
      svgX: normalized[i].x,
      svgY: normalized[i].y,
    }));
  }, [carPositions, bounds]);

  // Driver lookup
  const driverMap = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers]
  );

  // Start/finish line position (first point of the outline)
  const startFinish = normalizedTrack[0];

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          height,
          className
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-f1-red opacity-60" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/20">
            Loading circuit...
          </span>
        </div>
      </div>
    );
  }

  if (error || !trackPath) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          height,
          className
        )}
      >
        <div className="flex flex-col items-center gap-2 text-white/15">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span className="text-xs font-mono">
            {error || "No track data"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", height, className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Track glow filter */}
          <filter id="trackGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Car dot glow */}
          <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradient for the track line */}
          <linearGradient
            id="trackGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="rgba(225,6,0,0.6)" />
            <stop offset="33%" stopColor="rgba(225,6,0,0.3)" />
            <stop offset="66%" stopColor="rgba(225,6,0,0.5)" />
            <stop offset="100%" stopColor="rgba(225,6,0,0.6)" />
          </linearGradient>

          {/* Sector colors */}
          <linearGradient id="sectorGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e10600" stopOpacity="0.5" />
            <stop offset="33%" stopColor="#e10600" stopOpacity="0.3" />
            <stop offset="33%" stopColor="#3B82F6" stopOpacity="0.3" />
            <stop offset="66%" stopColor="#3B82F6" stopOpacity="0.3" />
            <stop offset="66%" stopColor="#ffc906" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffc906" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Track outline — outer glow */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(225,6,0,0.08)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#trackGlow)"
        />

        {/* Track outline — base dark */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Track outline — visible line */}
        <path
          d={trackPath}
          fill="none"
          stroke="url(#trackGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Track outline — inner bright line */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(225,6,0,0.8)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-50"
        />

        {/* Start/finish line indicator */}
        {startFinish && (
          <g>
            <rect
              x={startFinish.x - 8}
              y={startFinish.y - 2}
              width="16"
              height="4"
              fill="white"
              opacity="0.5"
              rx="1"
            />
            {/* Checkered pattern hint */}
            <rect
              x={startFinish.x - 8}
              y={startFinish.y - 2}
              width="4"
              height="2"
              fill="rgba(0,0,0,0.6)"
            />
            <rect
              x={startFinish.x}
              y={startFinish.y - 2}
              width="4"
              height="2"
              fill="rgba(0,0,0,0.6)"
            />
            <rect
              x={startFinish.x - 4}
              y={startFinish.y}
              width="4"
              height="2"
              fill="rgba(0,0,0,0.6)"
            />
            <rect
              x={startFinish.x + 4}
              y={startFinish.y}
              width="4"
              height="2"
              fill="rgba(0,0,0,0.6)"
            />
          </g>
        )}

        {/* Car position dots */}
        {normalizedCars.map((car) => {
          const driver = driverMap.get(car.driver_number);
          if (!driver) return null;

          const teamColor = getTeamColor(driver.team_name);
          const isHighlighted =
            !highlightDrivers || highlightDrivers.includes(car.driver_number);
          const isHovered = hoveredDriver === car.driver_number;

          return (
            <g
              key={car.driver_number}
              className="cursor-pointer transition-opacity duration-200"
              opacity={isHighlighted ? 1 : 0.3}
              onMouseEnter={() => setHoveredDriver(car.driver_number)}
              onMouseLeave={() => setHoveredDriver(null)}
            >
              {/* Glow ring */}
              <circle
                cx={car.svgX}
                cy={car.svgY}
                r={isHovered ? 12 : 8}
                fill={teamColor}
                opacity={isHovered ? 0.25 : 0.12}
                filter="url(#carGlow)"
                className="transition-all duration-300"
              />

              {/* Car dot */}
              <circle
                cx={car.svgX}
                cy={car.svgY}
                r={isHovered ? 6 : 4.5}
                fill={teamColor}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="1"
                className="transition-all duration-200"
              />

              {/* Driver number label */}
              {showLabels && (isHovered || compact) && (
                <text
                  x={car.svgX}
                  y={car.svgY - (isHovered ? 14 : 10)}
                  textAnchor="middle"
                  fill="white"
                  fontSize={isHovered ? "11" : "8"}
                  fontFamily="Titillium Web, sans-serif"
                  fontWeight="700"
                  opacity={isHovered ? 1 : 0.6}
                  className="transition-all duration-200 select-none"
                >
                  {driver.name_acronym}
                </text>
              )}

              {/* Expanded tooltip on hover */}
              {isHovered && !compact && (
                <g>
                  <rect
                    x={car.svgX - 40}
                    y={car.svgY - 38}
                    width="80"
                    height="22"
                    rx="4"
                    fill="rgba(21,21,30,0.95)"
                    stroke={teamColor}
                    strokeWidth="0.5"
                    strokeOpacity="0.5"
                  />
                  <text
                    x={car.svgX}
                    y={car.svgY - 22}
                    textAnchor="middle"
                    fill="white"
                    fontSize="9"
                    fontFamily="Fira Code, monospace"
                    fontWeight="600"
                  >
                    {driver.name_acronym} · #{car.driver_number}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Circuit name overlay */}
      {circuitName && !compact && (
        <div className="absolute bottom-3 left-4">
          <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/20">
            Circuit Layout
          </div>
          <div className="text-sm font-bold text-white/40 mt-0.5">
            {circuitName}
          </div>
        </div>
      )}
    </div>
  );
}
