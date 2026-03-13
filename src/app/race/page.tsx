"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Play, Pause, SkipForward, SkipBack, Flag, Timer,
  Cloud, Thermometer, Droplets, Wind, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ===== Speed Presets =====
const SPEED_PRESETS = [
  { label: "0.5x", ms: 200 },
  { label: "1x", ms: 100 },
  { label: "2x", ms: 50 },
  { label: "5x", ms: 20 },
  { label: "10x", ms: 10 },
  { label: "20x", ms: 5 },
];

// ===== Types =====
interface DriverInfo {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

interface LocationPoint {
  date: string;
  driver_number: number;
  x: number;
  y: number;
}

interface PositionEntry {
  date: string;
  driver_number: number;
  position: number;
}

interface StintEntry {
  driver_number: number;
  compound: string;
  lap_start: number;
  lap_end: number;
  stint_number: number;
}

interface WeatherEntry {
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  wind_speed: number;
  wind_direction: number;
  rainfall: number;
}

interface MeetingInfo {
  meeting_key: number;
  meeting_name: string;
  circuit_short_name: string;
  country_name: string;
}

interface SessionInfo {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_short_name: string;
  country_name: string;
  year: number;
}

const TIRE_COLORS: Record<string, string> = {
  SOFT: "#FF3333", MEDIUM: "#FFC906", HARD: "#FFFFFF",
  INTERMEDIATE: "#39B54A", WET: "#0067FF", UNKNOWN: "#666666",
};

export default function RaceReplayPage() {
  // Data state
  const [year, setYear] = useState(2025);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [meetings, setMeetings] = useState<MeetingInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [locationData, setLocationData] = useState<Record<number, LocationPoint[]>>({});
  const [positions, setPositions] = useState<PositionEntry[]>([]);
  const [stints, setStints] = useState<StintEntry[]>([]);
  const [weather, setWeather] = useState<WeatherEntry[]>([]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // Index into SPEED_PRESETS
  const [currentFrame, setCurrentFrame] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [dataReady, setDataReady] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Get meeting name for a session
  const getMeetingName = useCallback(
    (meetingKey: number) => meetings.find((m) => m.meeting_key === meetingKey)?.meeting_name || "",
    [meetings]
  );

  // ===== Fetch sessions + meetings for year =====
  useEffect(() => {
    setDataReady(false);
    setSelectedSession(null);

    Promise.all([
      fetch(`/api/f1/sessions?year=${year}&type=Race`).then((r) => r.json()),
      fetch(`/api/f1/meetings?year=${year}`).then((r) => r.json()),
    ]).then(([sessData, meetData]) => {
      const sess = Array.isArray(sessData) ? sessData : [];
      const meets = Array.isArray(meetData) ? meetData : [];
      setSessions(sess);
      setMeetings(meets);

      // Auto-select the latest past race
      const now = new Date();
      const pastRaces = sess.filter((s: SessionInfo) => new Date(s.date_start) < now);
      if (pastRaces.length > 0) setSelectedSession(pastRaces[pastRaces.length - 1]);
      else if (sess.length > 0) setSelectedSession(sess[0]);
    }).catch(console.error);
  }, [year]);

  // ===== Load race data when session selected =====
  useEffect(() => {
    if (!selectedSession) return;
    const sk = selectedSession.session_key;
    setDataReady(false);
    setCurrentFrame(0);
    setIsPlaying(false);
    setLoading(true);
    setLocationData({});

    async function loadData() {
      try {
        setLoadingMsg("Loading race data...");

        // Parallel fetch: drivers, positions, stints, weather
        const [driversRes, positionsRes, stintsRes, weatherRes] = await Promise.all([
          fetch(`/api/f1/drivers?session_key=${sk}`).then((r) => r.json()),
          fetch(`/api/f1/positions?session_key=${sk}`).then((r) => r.json()),
          fetch(`/api/f1/stints?session_key=${sk}`).then((r) => r.json()),
          fetch(`/api/f1/weather?session_key=${sk}`).then((r) => r.json()),
        ]);

        const drvs: DriverInfo[] = Array.isArray(driversRes) ? driversRes : [];
        setDrivers(drvs);
        setPositions(Array.isArray(positionsRes) ? positionsRes : []);
        setStints(Array.isArray(stintsRes) ? stintsRes : []);
        setWeather(Array.isArray(weatherRes) ? weatherRes : []);

        // Fetch location data for all drivers in batches
        const driverNums = drvs.map((d) => d.driver_number);
        const locMap: Record<number, LocationPoint[]> = {};

        for (let i = 0; i < driverNums.length; i += 4) {
          const batch = driverNums.slice(i, i + 4);
          setLoadingMsg(`Loading car positions... ${Math.min(i + 4, driverNums.length)}/${driverNums.length} drivers`);

          const results = await Promise.all(
            batch.map((num) =>
              fetch(`/api/f1/location?session_key=${sk}&driver_number=${num}`)
                .then((r) => r.json())
                .then((data) => ({ num, data: Array.isArray(data) ? data : [] }))
                .catch(() => ({ num, data: [] as LocationPoint[] }))
            )
          );

          results.forEach(({ num, data }) => {
            // Sample every 8th point (~1 update per 2 sec) to keep performant
            locMap[num] = data.filter((_: any, idx: number) => idx % 8 === 0);
          });
        }

        setLocationData(locMap);
        setSelectedDriver(driverNums[0] || null);
        setDataReady(true);
      } catch (err) {
        console.error("Load error:", err);
        setLoadingMsg("Failed to load race data. Try another race.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [selectedSession]);

  // ===== Build unified timeline =====
  const timeline = useMemo(() => {
    if (!dataReady) return [];
    const dateSet = new Set<string>();
    Object.values(locationData).forEach((pts) => pts.forEach((p) => dateSet.add(p.date)));
    return Array.from(dateSet).sort();
  }, [locationData, dataReady]);

  const totalFrames = timeline.length;

  // ===== Track bounds =====
  const trackBounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    Object.values(locationData).forEach((pts) => {
      pts.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });
    if (!isFinite(minX)) return { minX: 0, maxX: 1000, minY: 0, maxY: 1000, aspect: 1.6 };
    const padX = (maxX - minX) * 0.12;
    const padY = (maxY - minY) * 0.12;
    const width = (maxX - minX) + padX * 2;
    const height = (maxY - minY) + padY * 2;
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY,
      aspect: Math.max(0.5, Math.min(2.5, width / height)),
    };
  }, [locationData]);

  const rangeX = trackBounds.maxX - trackBounds.minX || 1;
  const rangeY = trackBounds.maxY - trackBounds.minY || 1;
  // Map to SVG coords with proper aspect-aware scaling
  const svgW = 1000;
  const svgH = Math.round(svgW / (trackBounds.aspect || 1.6));
  const normX = useCallback((x: number) => ((x - trackBounds.minX) / rangeX) * (svgW - 100) + 50, [trackBounds.minX, rangeX, svgW]);
  const normY = useCallback((y: number) => ((y - trackBounds.minY) / rangeY) * (svgH - 100) + 50, [trackBounds.minY, rangeY, svgH]);

  // ===== Track outline: extract one clean lap from mid-race data =====
  const trackPath = useMemo(() => {
    // Use driver with most data points
    let bestDriver = 0;
    let bestLen = 0;
    Object.entries(locationData).forEach(([num, pts]) => {
      if (pts.length > bestLen) { bestLen = pts.length; bestDriver = Number(num); }
    });

    const allPts = locationData[bestDriver];
    if (!allPts || allPts.length < 30) return "";

    // Filter out any zero/invalid coords
    const validPts = allPts.filter((p) => p.x !== 0 || p.y !== 0);
    if (validPts.length < 30) return "";

    // Estimate points per lap (data sampled every 8th -> ~40-50 pts/lap for a typical race)
    const estimatedLaps = 58;
    const ptsPerLap = Math.max(15, Math.round(validPts.length / estimatedLaps));

    // Skip first 20% of data to get past formation lap, pit exit, safety cars
    const skipStart = Math.floor(validPts.length * 0.2);
    const refIdx = Math.min(skipStart, validPts.length - ptsPerLap - 1);
    const refX = validPts[refIdx].x;
    const refY = validPts[refIdx].y;

    // From ref point, advance at least 50% of a lap before looking for loop-close
    const minAdvance = Math.floor(ptsPerLap * 0.5);
    const searchStart = refIdx + Math.max(minAdvance, 10);
    const searchEnd = Math.min(validPts.length, refIdx + ptsPerLap * 3);

    // Progressively widen threshold until we find a loop
    let lapEnd = -1;
    for (let threshPct = 0.03; threshPct <= 0.12; threshPct += 0.02) {
      const threshold = rangeX * threshPct;
      for (let i = searchStart; i < searchEnd; i++) {
        const dx = validPts[i].x - refX;
        const dy = validPts[i].y - refY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshold) {
          lapEnd = i;
          break;
        }
      }
      if (lapEnd !== -1) break;
    }

    // Fallback: just take one estimated lap's worth of points
    if (lapEnd === -1) {
      lapEnd = Math.min(refIdx + ptsPerLap, validPts.length - 1);
    }

    // Extract the single-lap slice
    const lapPts = validPts.slice(refIdx, lapEnd + 1);
    if (lapPts.length < 8) return "";

    // Sample to ~300 points for a smooth SVG path
    const step = Math.max(1, Math.floor(lapPts.length / 300));
    const sampled = lapPts.filter((_, i) => i % step === 0);
    if (sampled.length < 5) return "";

    return sampled
      .map((p, i) => `${i === 0 ? "M" : "L"} ${normX(p.x).toFixed(1)},${normY(p.y).toFixed(1)}`)
      .join(" ") + " Z";
  }, [locationData, normX, normY, rangeX]);

  // ===== Current car positions at frame =====
  const carPositions = useMemo(() => {
    if (!dataReady || totalFrames === 0) return [];
    const currentTime = timeline[Math.min(currentFrame, totalFrames - 1)];
    if (!currentTime) return [];

    return drivers
      .filter((d) => locationData[d.driver_number]?.length > 0)
      .map((d) => {
        const pts = locationData[d.driver_number];
        // Binary search for closest point <= currentTime
        let lo = 0, hi = pts.length - 1, closest = pts[0];
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (pts[mid].date <= currentTime) { closest = pts[mid]; lo = mid + 1; }
          else hi = mid - 1;
        }
        return { driver: d, x: normX(closest.x), y: normY(closest.y) };
      });
  }, [currentFrame, dataReady, drivers, locationData, timeline, totalFrames, normX, normY]);

  // ===== Leaderboard: latest position for each driver =====
  const leaderboard = useMemo(() => {
    if (!dataReady || totalFrames === 0) return [];
    const currentTime = timeline[Math.min(currentFrame, totalFrames - 1)];
    if (!currentTime) return [];

    // Build position map using binary search
    const posMap: Record<number, number> = {};
    const grouped: Record<number, PositionEntry[]> = {};
    positions.forEach((p) => {
      if (!grouped[p.driver_number]) grouped[p.driver_number] = [];
      grouped[p.driver_number].push(p);
    });

    Object.entries(grouped).forEach(([numStr, entries]) => {
      const num = Number(numStr);
      // entries are already sorted by date from the API
      let lastPos = entries[0]?.position || 99;
      for (const e of entries) {
        if (e.date <= currentTime) lastPos = e.position;
        else break;
      }
      posMap[num] = lastPos;
    });

    return drivers
      .map((d) => ({
        driver: d,
        position: posMap[d.driver_number] || 99,
        compound: getCompound(d.driver_number),
      }))
      .sort((a, b) => a.position - b.position);
  }, [currentFrame, dataReady, drivers, positions, timeline, totalFrames]);

  // ===== Get tire compound =====
  function getCompound(num: number): string {
    if (totalFrames === 0) return "UNKNOWN";
    const pct = currentFrame / totalFrames;
    // Estimate lap from progress (assume ~58 laps average)
    const totalLaps = selectedSession ? 58 : 58;
    const lap = Math.max(1, Math.round(pct * totalLaps));

    const driverStints = stints
      .filter((s) => s.driver_number === num)
      .sort((a, b) => a.stint_number - b.stint_number);

    for (const s of driverStints) {
      if (lap >= s.lap_start && lap <= (s.lap_end || 999)) return s.compound || "UNKNOWN";
    }
    return driverStints[driverStints.length - 1]?.compound || "UNKNOWN";
  }

  // ===== Current weather =====
  const currentWeather = useMemo(() => {
    if (weather.length === 0 || totalFrames === 0) return null;
    const ct = timeline[Math.min(currentFrame, totalFrames - 1)] || "";
    let latest = weather[0];
    for (const w of weather) { if (w.date <= ct) latest = w; else break; }
    return latest;
  }, [currentFrame, weather, timeline, totalFrames]);

  // ===== Animation loop (time-based) =====
  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;

    const speedMs = SPEED_PRESETS[playbackSpeed].ms;
    let lastFrameTime = 0;

    const step = (ts: number) => {
      if (!lastFrameTime) lastFrameTime = ts;
      const delta = ts - lastFrameTime;

      if (delta >= speedMs) {
        lastFrameTime = ts;
        setCurrentFrame((prev) => {
          const next = prev + 1;
          if (next >= totalFrames) { setIsPlaying(false); return totalFrames - 1; }
          return next;
        });
      }

      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, playbackSpeed, totalFrames]);

  // ===== Derived =====
  const estimatedLap = totalFrames > 0 ? Math.max(1, Math.round((currentFrame / totalFrames) * 58)) : 0;
  const meetingName = selectedSession ? getMeetingName(selectedSession.meeting_key) : "";
  const progressPct = totalFrames > 0 ? ((currentFrame / totalFrames) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header + Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Flag className="w-7 h-7 text-racing-red" />
            Race Replay
          </h1>
          <p className="text-sm text-f1-muted mt-1">
            {meetingName
              ? `${meetingName} · ${selectedSession?.circuit_short_name}, ${selectedSession?.country_name}`
              : "Select a year and race to replay"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl px-3 py-2 text-sm font-mono text-f1-sub cursor-pointer"
          >
            {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={selectedSession?.session_key || ""}
            onChange={(e) => {
              const s = sessions.find((s) => s.session_key === Number(e.target.value));
              if (s) setSelectedSession(s);
            }}
            className="bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl px-3 py-2 text-sm text-f1-sub cursor-pointer max-w-[300px]"
          >
            {sessions.map((s) => (
              <option key={s.session_key} value={s.session_key}>
                {getMeetingName(s.meeting_key) || s.session_name} — {s.circuit_short_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-card p-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-racing-blue mx-auto animate-spin" />
          <p className="text-sm text-f1-sub font-mono">{loadingMsg}</p>
          <p className="text-[10px] text-[var(--f1-text-dim)]">Loading real telemetry from OpenF1 API...</p>
        </div>
      )}

      {/* ===== RACE VIEW ===== */}
      {dataReady && !loading && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            {/* Track Map */}
            <div className="xl:col-span-3 glass-card p-3 relative overflow-hidden" style={{ background: "radial-gradient(ellipse at center, rgba(10,10,20,0.95) 0%, rgba(5,5,10,1) 100%)" }}>
              {/* Lap overlay */}
              <div className="absolute top-3 left-3 z-10 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-white/30 text-[10px] font-mono">LAP</span>
                  <span className="text-2xl font-mono font-black text-racing-blue glow-text">{estimatedLap}</span>
                  <span className="text-white/15 text-sm font-mono">/58</span>
                </div>
                <div className="text-[9px] font-mono text-white/20 mt-0.5">{progressPct}% complete</div>

              </div>

              {/* Weather overlay */}
              {currentWeather && (
                <div className="absolute top-3 right-3 z-10 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2">
                  <div className="text-[9px] font-semibold text-white/30 uppercase tracking-widest mb-1">Weather</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono text-white/50">
                    <span className="flex items-center gap-1"><Thermometer className="w-3 h-3 text-orange-400" />{currentWeather.track_temperature?.toFixed(1)}° trk</span>
                    <span className="flex items-center gap-1"><Cloud className="w-3 h-3 text-blue-300" />{currentWeather.air_temperature?.toFixed(1)}° air</span>
                    <span className="flex items-center gap-1"><Droplets className="w-3 h-3 text-cyan-400" />{currentWeather.humidity}%</span>
                    <span className="flex items-center gap-1"><Wind className="w-3 h-3 text-green-400" />{currentWeather.wind_speed?.toFixed(1)} km/h</span>
                  </div>
                  {currentWeather.rainfall > 0 && (
                    <div className="text-[10px] font-mono font-bold text-blue-400 mt-1 animate-pulse">RAIN</div>
                  )}
                </div>
              )}

              {/* SVG Track */}
              <div className="w-full" style={{ aspectRatio: `${svgW} / ${svgH}` }}>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
                  <defs>
                    {/* Neon track glow filter */}
                    <filter id="neonTrack">
                      <feGaussianBlur stdDeviation="6" />
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode />
                      </feMerge>
                    </filter>
                    {/* Neon car glow filter */}
                    <filter id="carGlow">
                      <feGaussianBlur stdDeviation="4" />
                    </filter>
                    {/* Neon car glow (selected) */}
                    <filter id="carGlowSelected">
                      <feGaussianBlur stdDeviation="6" />
                    </filter>
                  </defs>

                  {/* Track layer 1: wide glow */}
                  {trackPath && (
                    <path
                      d={trackPath}
                      fill="none"
                      stroke="rgba(59,130,246,0.15)"
                      strokeWidth="28"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      filter="url(#neonTrack)"
                    />
                  )}
                  {/* Track layer 2: neon edge */}
                  {trackPath && (
                    <path
                      d={trackPath}
                      fill="none"
                      stroke="rgba(59,130,246,0.4)"
                      strokeWidth="12"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Track layer 3: bright core */}
                  {trackPath && (
                    <path
                      d={trackPath}
                      fill="none"
                      stroke="rgba(59,130,246,0.7)"
                      strokeWidth="6"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Track layer 4: white center */}
                  {trackPath && (
                    <path
                      d={trackPath}
                      fill="none"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Car dots with neon glow */}
                  {carPositions.map(({ driver, x, y }) => {
                    const color = `#${driver.team_colour || "888888"}`;
                    const isSel = selectedDriver === driver.driver_number;

                    return (
                      <g
                        key={driver.driver_number}
                        onClick={() => setSelectedDriver(driver.driver_number)}
                        className="cursor-pointer"
                      >
                        {/* Outer aura */}
                        <circle
                          cx={x} cy={y}
                          r={isSel ? 18 : 14}
                          fill={color}
                          opacity={0.08}
                          filter={isSel ? "url(#carGlowSelected)" : "url(#carGlow)"}
                        />
                        {/* Inner glow ring */}
                        <circle
                          cx={x} cy={y}
                          r={isSel ? 12 : 9}
                          fill={color}
                          opacity={0.6}
                        />
                        {/* Core dot */}
                        <circle
                          cx={x} cy={y}
                          r={isSel ? 8 : 6}
                          fill={color}
                        />
                        {/* White-hot center */}
                        <circle
                          cx={x} cy={y}
                          r={isSel ? 3 : 2}
                          fill="rgba(255,255,255,1)"
                        />
                        {/* Label with drop shadow */}
                        <text
                          x={x + (isSel ? 16 : 11)}
                          y={y + 4}
                          fill={color}
                          fontSize={isSel ? "18" : "13"}
                          fontFamily="Fira Code, monospace"
                          fontWeight="bold"
                          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                        >
                          {driver.name_acronym}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="glass-card p-3">
              <h2 className="text-xs font-semibold mb-2 flex items-center gap-2 text-f1-sub">
                <Timer className="w-3.5 h-3.5 text-racing-amber" />
                Leaderboard
              </h2>
              <div className="space-y-px max-h-[300px] sm:max-h-[400px] lg:max-h-[560px] overflow-y-auto fade-bottom">
                {leaderboard.map((entry, i) => {
                  const color = `#${entry.driver.team_colour || "888888"}`;
                  const tireColor = TIRE_COLORS[entry.compound] || TIRE_COLORS.UNKNOWN;
                  const isSel = selectedDriver === entry.driver.driver_number;

                  return (
                    <button
                      key={entry.driver.driver_number}
                      onClick={() => setSelectedDriver(entry.driver.driver_number)}
                      className={cn(
                        "flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg transition-all cursor-pointer text-left",
                        isSel ? "bg-black/[0.04] dark:bg-white/[0.08] ring-1 ring-[var(--f1-border)]" : "hover:bg-[var(--f1-hover)]"
                      )}
                    >
                      <span className={cn(
                        "w-5 h-5 flex items-center justify-center rounded text-[9px] font-mono font-bold flex-shrink-0",
                        i === 0 && "bg-racing-amber/20 text-racing-amber",
                        i === 1 && "bg-[var(--f1-hover)] text-f1-sub",
                        i === 2 && "bg-orange-900/30 text-orange-400",
                        i > 2 && "text-[var(--f1-text-dim)]"
                      )}>
                        {entry.position <= 20 ? entry.position : "-"}
                      </span>
                      <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }} />
                      <span className="text-[11px] font-mono font-bold flex-1 truncate" style={{ color, textShadow: `0 0 6px ${color}` }}>
                        {entry.driver.name_acronym}
                      </span>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tireColor }} title={entry.compound} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Driver Bar */}
          {selectedDriver && (() => {
            const d = drivers.find((dr) => dr.driver_number === selectedDriver);
            if (!d) return null;
            const color = `#${d.team_colour || "888888"}`;
            const comp = getCompound(selectedDriver);
            return (
              <div className="glass-card px-4 py-3 flex flex-wrap items-center gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs" style={{ backgroundColor: `${color}20`, color }}>
                    {d.driver_number}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{d.full_name}</div>
                    <div className="text-[10px] text-[var(--f1-text-dim)]">{d.team_name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TIRE_COLORS[comp] || "#666" }} />
                  <span className="text-[10px] font-mono text-f1-muted">{comp}</span>
                </div>
              </div>
            );
          })()}

          {/* Playback Controls */}
          <div className="glass-card px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentFrame(Math.max(0, currentFrame - Math.round(totalFrames * 0.05)))}
                  className="p-2 rounded-xl hover:bg-[var(--f1-hover)] text-f1-muted hover:text-f1-sub transition-colors cursor-pointer touch-manipulation"
                  aria-label="Rewind"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={cn(
                    "p-2.5 rounded-xl transition-all cursor-pointer touch-manipulation",
                    isPlaying ? "bg-racing-red/20 text-racing-red" : "bg-racing-blue/20 text-racing-blue"
                  )}
                  style={{
                    boxShadow: isPlaying
                      ? "0 0 15px rgba(225,6,0,0.3)"
                      : "0 0 15px rgba(59,130,246,0.3)"
                  }}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => setCurrentFrame(Math.min(totalFrames - 1, currentFrame + Math.round(totalFrames * 0.05)))}
                  className="p-2 rounded-xl hover:bg-[var(--f1-hover)] text-f1-muted hover:text-f1-sub transition-colors cursor-pointer touch-manipulation"
                  aria-label="Forward"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Progress bar */}
              <div className="flex-1 relative">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, totalFrames - 1)}
                  value={currentFrame}
                  onChange={(e) => { setCurrentFrame(Number(e.target.value)); setIsPlaying(false); }}
                  className="w-full h-2 rounded-full appearance-none bg-[var(--f1-hover)] cursor-pointer touch-manipulation
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-racing-blue [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                />
              </div>

              {/* Speed */}
              <div className="flex items-center gap-0.5">
                {SPEED_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPlaybackSpeed(idx)}
                    className={cn(
                      "px-1.5 py-1 rounded-lg text-[9px] font-mono font-bold cursor-pointer transition-all touch-manipulation",
                      playbackSpeed === idx ? "bg-racing-blue/20 text-racing-blue" : "text-[var(--f1-text-dim)] hover:text-f1-sub"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!dataReady && !loading && (
        <div className="glass-card p-20 text-center space-y-3">
          <Flag className="w-12 h-12 text-[var(--f1-text-dim)] mx-auto" />
          <p className="text-f1-muted text-sm">Select a year and race above to load the replay</p>
          <p className="text-[var(--f1-text-dim)] text-[10px] font-mono">Real car positions from OpenF1 API</p>
        </div>
      )}
    </div>
  );
}
