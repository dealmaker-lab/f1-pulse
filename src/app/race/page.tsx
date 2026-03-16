"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Play, Pause, SkipForward, SkipBack, Flag, Timer,
  Cloud, Thermometer, Droplets, Wind, Loader2,
  Gauge, Zap, AlertTriangle, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OPENF1_YEARS } from "@/lib/constants";
import { SESSION_FILTER_OPTIONS, filterPastSessions } from "@/lib/session-filters";

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
  compound: string | null;
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

interface CarDataEntry {
  date: string;
  driver_number: number;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  drs: number | null;
  rpm: number;
}

interface IntervalEntry {
  date: string;
  driver_number: number;
  gap_to_leader: number | null;
  interval: number | null;
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

// ===== Telemetry Card Component =====
function TelemetryCard({
  driver,
  carData,
  compound,
  tireAge,
  interval,
  gapToLeader,
  position,
  isSelected,
  onSelect,
}: {
  driver: DriverInfo;
  carData: CarDataEntry | null;
  compound: string;
  tireAge: number;
  interval: number | null;
  gapToLeader: number | null;
  position: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const color = `#${driver.team_colour || "888888"}`;
  const tireColor = TIRE_COLORS[compound] || TIRE_COLORS.UNKNOWN;
  const speed = carData?.speed ?? 0;
  const throttle = carData?.throttle ?? 0;
  const brake = carData?.brake ?? 0;
  const gear = carData?.n_gear ?? 0;
  const drs = carData?.drs;
  const isDrsOpen = drs != null && drs >= 10 && drs <= 14;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border transition-all overflow-hidden",
        isSelected
          ? "ring-1 ring-white/20 bg-black/40"
          : "bg-black/20 hover:bg-black/30 border-transparent"
      )}
      style={{ borderColor: isSelected ? `${color}50` : undefined }}
    >
      {/* Color accent top */}
      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />

      <div className="px-3 py-2 space-y-2">
        {/* Header: position + name + DRS */}
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-mono font-black w-5 text-center",
            position === 1 && "text-racing-amber",
            position === 2 && "text-white/60",
            position === 3 && "text-orange-400",
            position > 3 && "text-white/30"
          )}>
            P{position <= 20 ? position : "-"}
          </span>
          <span className="text-xs font-mono font-bold flex-1" style={{ color }}>
            {driver.name_acronym}
          </span>
          {isDrsOpen && (
            <span className="text-[8px] font-mono font-bold bg-racing-green/30 text-racing-green px-1.5 py-0.5 rounded animate-pulse">
              DRS
            </span>
          )}
        </div>

        {/* Speed + Gear */}
        <div className="flex items-end gap-2">
          <span className="text-lg font-mono font-black text-white/90 leading-none tabular-nums">
            {speed}
          </span>
          <span className="text-[9px] text-white/30 font-mono mb-0.5">km/h</span>
          <span className="ml-auto text-sm font-mono font-bold text-white/50">
            G{gear}
          </span>
        </div>

        {/* Throttle / Brake bars */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] font-mono text-white/25 w-5">THR</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{ width: `${throttle}%`, backgroundColor: "#39B54A" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] font-mono text-white/25 w-5">BRK</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{ width: `${brake}%`, backgroundColor: "#E10600" }}
              />
            </div>
          </div>
        </div>

        {/* Tire + Gap row */}
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: tireColor }} />
            <span className="text-white/40">{compound?.charAt(0) || "?"}</span>
            <span className="text-white/20">L{tireAge}</span>
          </div>
          <div className="flex-1" />
          {gapToLeader !== null && gapToLeader > 0 && (
            <span className="text-white/30">+{gapToLeader.toFixed(1)}s</span>
          )}
          {interval !== null && interval > 0 && (
            <span className="text-racing-amber/50">Δ{interval.toFixed(1)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ===== Progress Bar with Tire Strategy =====
function TireProgressBar({
  stints,
  totalLaps,
  currentLap,
  driverNumber,
}: {
  stints: StintEntry[];
  totalLaps: number;
  currentLap: number;
  driverNumber: number | null;
}) {
  if (!driverNumber) return null;
  const driverStints = stints
    .filter((s) => s.driver_number === driverNumber)
    .sort((a, b) => a.stint_number - b.stint_number);

  if (!driverStints.length) return null;

  return (
    <div className="flex items-center gap-0.5 h-3">
      {driverStints.map((stint, i) => {
        const start = stint.lap_start;
        const end = stint.lap_end || totalLaps;
        const widthPct = ((end - start + 1) / totalLaps) * 100;
        const isCurrent = currentLap >= start && currentLap <= end;
        const color = TIRE_COLORS[stint.compound && stint.compound !== "None" ? stint.compound : "UNKNOWN"] || TIRE_COLORS.UNKNOWN;

        return (
          <div
            key={i}
            className={cn(
              "h-full rounded-sm transition-opacity",
              isCurrent ? "opacity-100 ring-1 ring-white/30" : currentLap > end ? "opacity-40" : "opacity-25"
            )}
            style={{
              width: `${widthPct}%`,
              backgroundColor: color,
              minWidth: "4px",
            }}
            title={`${stint.compound || "Unknown"} — Laps ${start}-${end}`}
          />
        );
      })}
    </div>
  );
}


export default function RaceReplayPage() {
  // Data state
  const [year, setYear] = useState(OPENF1_YEARS[0]);
  const [sessionType, setSessionType] = useState<string>("Race");
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [meetings, setMeetings] = useState<MeetingInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [locationData, setLocationData] = useState<Record<number, LocationPoint[]>>({});
  const [positions, setPositions] = useState<PositionEntry[]>([]);
  const [stints, setStints] = useState<StintEntry[]>([]);
  const [weather, setWeather] = useState<WeatherEntry[]>([]);
  const [carDataMap, setCarDataMap] = useState<Record<number, CarDataEntry[]>>({});
  const [intervals, setIntervals] = useState<IntervalEntry[]>([]);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [dataReady, setDataReady] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [showTelemetry, setShowTelemetry] = useState(true);

  const animRef = useRef<number | null>(null);

  const getMeetingName = useCallback(
    (meetingKey: number) => meetings.find((m) => m.meeting_key === meetingKey)?.meeting_name || "",
    [meetings]
  );

  // ===== Fetch sessions + meetings =====
  useEffect(() => {
    setDataReady(false);
    setSelectedSession(null);

    Promise.all([
      fetch(`/api/f1/sessions?year=${year}`).then((r) => r.json()),
      fetch(`/api/f1/meetings?year=${year}`).then((r) => r.json()),
    ]).then(([sessData, meetData]) => {
      setAllSessions(Array.isArray(sessData) ? sessData : []);
      setMeetings(Array.isArray(meetData) ? meetData : []);
    }).catch(console.error);
  }, [year]);

  // ===== Filter sessions by type =====
  useEffect(() => {
    const filtered = filterPastSessions(allSessions, sessionType);
    setSessions(filtered);
    if (filtered.length > 0) {
      setSelectedSession(filtered[filtered.length - 1]);
    } else {
      setSelectedSession(null);
    }
  }, [allSessions, sessionType]);

  // ===== Load all data when session selected =====
  useEffect(() => {
    if (!selectedSession) return;
    const sk = selectedSession.session_key;
    setDataReady(false);
    setCurrentFrame(0);
    setIsPlaying(false);
    setLoading(true);
    setLocationData({});
    setCarDataMap({});
    setIntervals([]);

    async function loadData() {
      try {
        setLoadingMsg("Loading session data...");

        // Phase 1: core data
        const [driversRes, positionsRes, stintsRes, weatherRes, intervalsRes] = await Promise.all([
          fetch(`/api/f1/drivers?session_key=${sk}`).then((r) => r.json()),
          fetch(`/api/f1/positions?session_key=${sk}`).then((r) => r.json()),
          fetch(`/api/f1/stints?session_key=${sk}`).then((r) => r.json()),
          fetch(`/api/f1/weather?session_key=${sk}`).then((r) => r.json()),
          fetch(`/api/f1/intervals?session_key=${sk}`).then((r) => r.json()).catch(() => []),
        ]);

        const drvs: DriverInfo[] = Array.isArray(driversRes) ? driversRes : [];
        setDrivers(drvs);
        setPositions(Array.isArray(positionsRes) ? positionsRes : []);
        setStints(Array.isArray(stintsRes) ? stintsRes : []);
        setWeather(Array.isArray(weatherRes) ? weatherRes : []);
        setIntervals(Array.isArray(intervalsRes) ? intervalsRes : []);

        const driverNums = drvs.map((d) => d.driver_number);

        // Phase 2: location data — sample every 4th point for higher density
        const locMap: Record<number, LocationPoint[]> = {};
        for (let i = 0; i < driverNums.length; i += 5) {
          const batch = driverNums.slice(i, i + 5);
          setLoadingMsg(`Loading car positions... ${Math.min(i + 5, driverNums.length)}/${driverNums.length}`);

          const results = await Promise.all(
            batch.map((num) =>
              fetch(`/api/f1/location?session_key=${sk}&driver_number=${num}`)
                .then((r) => r.json())
                .then((data) => ({ num, data: Array.isArray(data) ? data : [] }))
                .catch(() => ({ num, data: [] as LocationPoint[] }))
            )
          );

          results.forEach(({ num, data }) => {
            // Filter out (0,0) points (pit/grid) and sample every 4th (~1/sec)
            const valid = data.filter((p: LocationPoint) => p.x !== 0 || p.y !== 0);
            locMap[num] = valid.filter((_: LocationPoint, idx: number) => idx % 4 === 0);
          });
        }
        setLocationData(locMap);

        // Phase 3: car telemetry for selected drivers (top 6 initially)
        // We load the top 3 drivers + first-loaded data to keep it fast
        setLoadingMsg("Loading car telemetry...");
        const telemetryDrivers = driverNums.slice(0, 3);
        const cdMap: Record<number, CarDataEntry[]> = {};

        for (const num of telemetryDrivers) {
          try {
            const res = await fetch(`/api/f1/car-data?session_key=${sk}&driver_number=${num}`);
            const data = await res.json();
            if (Array.isArray(data)) {
              // Sample every 20th for manageable size (~4Hz down to ~0.2Hz per driver)
              cdMap[num] = data.filter((_: CarDataEntry, idx: number) => idx % 20 === 0);
            }
          } catch {
            // Skip individual driver failures
          }
        }
        setCarDataMap(cdMap);

        setSelectedDriver(driverNums[0] || null);
        setDataReady(true);
      } catch (err) {
        console.error("Load error:", err);
        setLoadingMsg("Failed to load data. Try another session.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [selectedSession]);

  // Lazy-load telemetry for a selected driver if not already loaded
  useEffect(() => {
    if (!selectedDriver || !selectedSession || !dataReady) return;
    if (carDataMap[selectedDriver]) return; // Already loaded

    const sk = selectedSession.session_key;
    fetch(`/api/f1/car-data?session_key=${sk}&driver_number=${selectedDriver}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCarDataMap((prev) => ({
            ...prev,
            [selectedDriver]: data.filter((_: CarDataEntry, idx: number) => idx % 20 === 0),
          }));
        }
      })
      .catch(() => {});
  }, [selectedDriver, selectedSession, dataReady, carDataMap]);

  // ===== Build unified timeline =====
  const timeline = useMemo(() => {
    if (!dataReady) return [];
    const dateSet = new Set<string>();
    Object.values(locationData).forEach((pts) => pts.forEach((p) => dateSet.add(p.date)));
    return Array.from(dateSet).sort();
  }, [locationData, dataReady]);

  const totalFrames = timeline.length;

  // ===== Lap count from stints =====
  const totalLaps = useMemo(() => {
    if (!stints.length) return 58;
    const maxEnd = Math.max(...stints.map((s) => s.lap_end || 0).filter(Boolean));
    return maxEnd > 0 ? maxEnd : 58;
  }, [stints]);

  const estimatedLap = totalFrames > 0 ? Math.max(1, Math.round((currentFrame / totalFrames) * totalLaps)) : 0;

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
      minX: minX - padX, maxX: maxX + padX,
      minY: minY - padY, maxY: maxY + padY,
      aspect: Math.max(0.5, Math.min(2.5, width / height)),
    };
  }, [locationData]);

  const rangeX = trackBounds.maxX - trackBounds.minX || 1;
  const rangeY = trackBounds.maxY - trackBounds.minY || 1;
  const svgW = 1000;
  const svgH = Math.round(svgW / (trackBounds.aspect || 1.6));
  const normX = useCallback((x: number) => ((x - trackBounds.minX) / rangeX) * (svgW - 100) + 50, [trackBounds.minX, rangeX]);
  const normY = useCallback((y: number) => ((y - trackBounds.minY) / rangeY) * (svgH - 100) + 50, [trackBounds.minY, rangeY, svgH]);

  // ===== Track outline =====
  const trackPath = useMemo(() => {
    let bestDriver = 0, bestLen = 0;
    Object.entries(locationData).forEach(([num, pts]) => {
      if (pts.length > bestLen) { bestLen = pts.length; bestDriver = Number(num); }
    });

    const allPts = locationData[bestDriver];
    if (!allPts || allPts.length < 30) return "";
    const validPts = allPts.filter((p) => p.x !== 0 || p.y !== 0);
    if (validPts.length < 30) return "";

    const ptsPerLap = Math.max(15, Math.round(validPts.length / totalLaps));
    const skipStart = Math.floor(validPts.length * 0.2);
    const refIdx = Math.min(skipStart, validPts.length - ptsPerLap - 1);
    const refX = validPts[refIdx].x;
    const refY = validPts[refIdx].y;

    const minAdvance = Math.floor(ptsPerLap * 0.5);
    const searchStart = refIdx + Math.max(minAdvance, 10);
    const searchEnd = Math.min(validPts.length, refIdx + ptsPerLap * 3);

    let lapEnd = -1;
    for (let threshPct = 0.03; threshPct <= 0.12; threshPct += 0.02) {
      const threshold = rangeX * threshPct;
      for (let i = searchStart; i < searchEnd; i++) {
        const dx = validPts[i].x - refX;
        const dy = validPts[i].y - refY;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) { lapEnd = i; break; }
      }
      if (lapEnd !== -1) break;
    }
    if (lapEnd === -1) lapEnd = Math.min(refIdx + ptsPerLap, validPts.length - 1);

    const lapPts = validPts.slice(refIdx, lapEnd + 1);
    if (lapPts.length < 8) return "";

    const step = Math.max(1, Math.floor(lapPts.length / 300));
    const sampled = lapPts.filter((_, i) => i % step === 0);
    if (sampled.length < 5) return "";

    return sampled
      .map((p, i) => `${i === 0 ? "M" : "L"} ${normX(p.x).toFixed(1)},${normY(p.y).toFixed(1)}`)
      .join(" ") + " Z";
  }, [locationData, normX, normY, rangeX, totalLaps]);

  // ===== DRS zones: detect straights where DRS is commonly activated =====
  const drsZones = useMemo(() => {
    // Analyze car data to find locations where DRS is open (drs >= 10)
    // We'll overlay green segments on the track for these zones
    const zones: { path: string }[] = [];

    // Find first driver with car data
    const driverWithData = Object.entries(carDataMap).find(([, data]) => data.length > 50);
    if (!driverWithData) return zones;

    const [driverNumStr, cData] = driverWithData;
    const driverNum = Number(driverNumStr);
    const locPts = locationData[driverNum];
    if (!locPts || locPts.length < 50) return zones;

    // Find DRS-open segments
    const drsSegments: { startIdx: number; endIdx: number }[] = [];
    let segStart = -1;
    for (let i = 0; i < cData.length; i++) {
      const isDrsOpen = cData[i].drs != null && cData[i].drs! >= 10 && cData[i].drs! <= 14;
      if (isDrsOpen && segStart === -1) segStart = i;
      if (!isDrsOpen && segStart !== -1) {
        if (i - segStart > 3) drsSegments.push({ startIdx: segStart, endIdx: i - 1 });
        segStart = -1;
      }
    }

    // Map DRS segments to location points by time-matching
    for (const seg of drsSegments.slice(0, 6)) { // Max 6 DRS zones
      const startTime = cData[seg.startIdx].date;
      const endTime = cData[seg.endIdx].date;

      const zonePts = locPts.filter((p) => p.date >= startTime && p.date <= endTime);
      if (zonePts.length < 3) continue;

      const step = Math.max(1, Math.floor(zonePts.length / 40));
      const sampled = zonePts.filter((_, i) => i % step === 0);
      if (sampled.length < 2) continue;

      const path = sampled
        .map((p, i) => `${i === 0 ? "M" : "L"} ${normX(p.x).toFixed(1)},${normY(p.y).toFixed(1)}`)
        .join(" ");
      zones.push({ path });
    }

    return zones;
  }, [carDataMap, locationData, normX, normY]);

  // ===== Current car positions =====
  const carPositions = useMemo(() => {
    if (!dataReady || totalFrames === 0) return [];
    const currentTime = timeline[Math.min(currentFrame, totalFrames - 1)];
    if (!currentTime) return [];

    return drivers
      .filter((d) => locationData[d.driver_number]?.length > 0)
      .map((d) => {
        const pts = locationData[d.driver_number];
        let lo = 0, hi = pts.length - 1, closest = pts[0];
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (pts[mid].date <= currentTime) { closest = pts[mid]; lo = mid + 1; }
          else hi = mid - 1;
        }
        return { driver: d, x: normX(closest.x), y: normY(closest.y) };
      });
  }, [currentFrame, dataReady, drivers, locationData, timeline, totalFrames, normX, normY]);

  // ===== Leaderboard with telemetry =====
  const leaderboard = useMemo(() => {
    if (!dataReady || totalFrames === 0) return [];
    const currentTime = timeline[Math.min(currentFrame, totalFrames - 1)];
    if (!currentTime) return [];

    // Position
    const posMap: Record<number, number> = {};
    const grouped: Record<number, PositionEntry[]> = {};
    positions.forEach((p) => {
      if (!grouped[p.driver_number]) grouped[p.driver_number] = [];
      grouped[p.driver_number].push(p);
    });
    Object.entries(grouped).forEach(([numStr, entries]) => {
      const num = Number(numStr);
      let lastPos = entries[0]?.position || 99;
      for (const e of entries) {
        if (e.date <= currentTime) lastPos = e.position;
        else break;
      }
      posMap[num] = lastPos;
    });

    // Intervals
    const intervalMap: Record<number, { gap: number | null; interval: number | null }> = {};
    const intGrouped: Record<number, IntervalEntry[]> = {};
    intervals.forEach((iv) => {
      if (!intGrouped[iv.driver_number]) intGrouped[iv.driver_number] = [];
      intGrouped[iv.driver_number].push(iv);
    });
    Object.entries(intGrouped).forEach(([numStr, entries]) => {
      const num = Number(numStr);
      let latest: IntervalEntry = entries[0];
      for (const e of entries) {
        if (e.date <= currentTime) latest = e;
        else break;
      }
      if (latest) {
        intervalMap[num] = { gap: latest.gap_to_leader, interval: latest.interval };
      }
    });

    // Car data
    const carDataAtFrame: Record<number, CarDataEntry | null> = {};
    Object.entries(carDataMap).forEach(([numStr, entries]) => {
      const num = Number(numStr);
      let latest: CarDataEntry = entries[0];
      for (const e of entries) {
        if (e.date <= currentTime) latest = e;
        else break;
      }
      carDataAtFrame[num] = latest || null;
    });

    return drivers
      .map((d) => {
        const pos = posMap[d.driver_number] || 99;
        const compound = getCompound(d.driver_number);
        const tireAge = getTireAge(d.driver_number);
        const iv = intervalMap[d.driver_number] || { gap: null, interval: null };
        return {
          driver: d,
          position: pos,
          compound,
          tireAge,
          gapToLeader: iv.gap,
          interval: iv.interval,
          carData: carDataAtFrame[d.driver_number] || null,
        };
      })
      .sort((a, b) => a.position - b.position);
  }, [currentFrame, dataReady, drivers, positions, intervals, carDataMap, timeline, totalFrames]);

  // ===== Get tire compound + age =====
  function getCompound(num: number): string {
    if (totalFrames === 0) return "UNKNOWN";
    const lap = estimatedLap;
    const driverStints = stints
      .filter((s) => s.driver_number === num)
      .sort((a, b) => a.stint_number - b.stint_number);
    for (const s of driverStints) {
      if (lap >= s.lap_start && lap <= (s.lap_end || 999)) return (s.compound && s.compound !== "None") ? s.compound : "UNKNOWN";
    }
    const last = driverStints[driverStints.length - 1]?.compound;
    return (last && last !== "None") ? last : "UNKNOWN";
  }

  function getTireAge(num: number): number {
    if (totalFrames === 0) return 0;
    const lap = estimatedLap;
    const driverStints = stints
      .filter((s) => s.driver_number === num)
      .sort((a, b) => a.stint_number - b.stint_number);
    for (const s of driverStints) {
      if (lap >= s.lap_start && lap <= (s.lap_end || 999)) return lap - s.lap_start + 1;
    }
    return 0;
  }

  // ===== Current weather =====
  const currentWeather = useMemo(() => {
    if (weather.length === 0 || totalFrames === 0) return null;
    const ct = timeline[Math.min(currentFrame, totalFrames - 1)] || "";
    let latest = weather[0];
    for (const w of weather) { if (w.date <= ct) latest = w; else break; }
    return latest;
  }, [currentFrame, weather, timeline, totalFrames]);

  // ===== Detect Safety Car / VSC from weather or position bunching =====
  const safetyCarStatus = useMemo(() => {
    // Heuristic: if the top 10 drivers all have small intervals → likely SC
    // Only trigger after lap 5 and require valid interval data
    if (leaderboard.length < 5 || estimatedLap < 5) return null;
    const top10 = leaderboard.slice(0, 10);
    const validIntervals = top10
      .filter((e) => e.interval !== null && typeof e.interval === "number" && e.interval > 0)
      .map((e) => e.interval as number);
    // Need at least 6 drivers with real interval data
    if (validIntervals.length < 6) return null;
    const avgInterval = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
    // Also check that leader gap for P10 is reasonable (not 0)
    const p10Gap = top10[9]?.gapToLeader;
    if (p10Gap !== null && typeof p10Gap === "number" && p10Gap > 0 && p10Gap < 15 && avgInterval < 1.5) return "SC";
    return null;
  }, [leaderboard, estimatedLap]);

  // ===== Animation loop =====
  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;
    const speedMs = SPEED_PRESETS[playbackSpeed].ms;
    let lastFrameTime = 0;

    const step = (ts: number) => {
      if (!lastFrameTime) lastFrameTime = ts;
      if (ts - lastFrameTime >= speedMs) {
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
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, playbackSpeed, totalFrames]);

  // ===== Keyboard shortcuts =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); setIsPlaying((p) => !p); }
      if (e.key === "ArrowRight") setCurrentFrame((f) => Math.min(totalFrames - 1, f + Math.round(totalFrames * 0.02)));
      if (e.key === "ArrowLeft") setCurrentFrame((f) => Math.max(0, f - Math.round(totalFrames * 0.02)));
      if (e.key === "ArrowUp") setPlaybackSpeed((s) => Math.min(SPEED_PRESETS.length - 1, s + 1));
      if (e.key === "ArrowDown") setPlaybackSpeed((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [totalFrames]);

  const meetingName = selectedSession ? getMeetingName(selectedSession.meeting_key) : "";
  const progressPct = totalFrames > 0 ? ((currentFrame / totalFrames) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header + Selectors */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <Flag className="w-5 sm:w-7 h-5 sm:h-7 text-racing-red flex-shrink-0" />
              Race Replay
            </h1>
            <p className="text-xs sm:text-sm text-f1-muted mt-1 truncate">
              {meetingName
                ? `${meetingName} · ${selectedSession?.circuit_short_name}, ${selectedSession?.country_name}`
                : "Select a session to replay"}
            </p>
          </div>
          {dataReady && (
            <div className="flex items-center gap-2 text-[9px] font-mono text-white/30">
              <span>SPACE=play</span>
              <span>←→=seek</span>
              <span>↑↓=speed</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-full bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl px-2 sm:px-3 py-2 text-xs sm:text-sm font-mono text-f1-sub cursor-pointer"
          >
            {OPENF1_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            className="w-full bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl px-2 sm:px-3 py-2 text-xs sm:text-sm font-mono text-f1-sub cursor-pointer"
          >
            {SESSION_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.shortLabel}</option>)}
          </select>
          <select
            value={selectedSession?.session_key || ""}
            onChange={(e) => {
              const s = sessions.find((s) => s.session_key === Number(e.target.value));
              if (s) setSelectedSession(s);
            }}
            className="w-full bg-[var(--f1-card)] border border-[var(--f1-border)] rounded-xl px-2 sm:px-3 py-2 text-xs sm:text-sm text-f1-sub cursor-pointer truncate"
          >
            {sessions.length === 0 && <option value="">No sessions</option>}
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
        <div className="glass-card p-12 sm:p-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-racing-blue mx-auto animate-spin" />
          <p className="text-sm text-f1-sub font-mono">{loadingMsg}</p>
          <p className="text-[10px] text-[var(--f1-text-dim)]">Loading telemetry from OpenF1 API...</p>
        </div>
      )}

      {/* ===== RACE VIEW ===== */}
      {dataReady && !loading && (
        <>
          {/* Safety Car Banner */}
          {safetyCarStatus && (
            <div className="glass-card px-4 py-2 flex items-center gap-3 border-racing-amber/30 bg-racing-amber/5">
              <AlertTriangle className="w-4 h-4 text-racing-amber animate-pulse" />
              <span className="text-xs font-mono font-bold text-racing-amber">
                SAFETY CAR DETECTED
              </span>
              <span className="text-[10px] font-mono text-racing-amber/50">
                Field bunched — intervals &lt;1.5s
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            {/* Track Map */}
            <div className="xl:col-span-3 glass-card p-2 sm:p-3 relative overflow-hidden" style={{ background: "radial-gradient(ellipse at center, rgba(10,10,20,0.95) 0%, rgba(5,5,10,1) 100%)" }}>
              {/* Lap overlay */}
              <div className="absolute top-2 sm:top-3 left-2 sm:left-3 z-10 bg-black/70 backdrop-blur-sm rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-white/30 text-[8px] sm:text-[10px] font-mono">LAP</span>
                  <span className="text-lg sm:text-2xl font-mono font-black text-racing-blue glow-text">{estimatedLap}</span>
                  <span className="text-white/15 text-xs sm:text-sm font-mono">/{totalLaps}</span>
                </div>
                <div className="text-[8px] sm:text-[9px] font-mono text-white/20 mt-0.5">{progressPct}%</div>
              </div>

              {/* Weather overlay */}
              {currentWeather && (
                <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 bg-black/70 backdrop-blur-sm rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
                  <div className="grid grid-cols-2 gap-x-2 sm:gap-x-3 gap-y-0.5 text-[9px] sm:text-[10px] font-mono text-white/50">
                    <span className="flex items-center gap-1"><Thermometer className="w-2.5 h-2.5 text-orange-400" />{currentWeather.track_temperature?.toFixed(0)}°T</span>
                    <span className="flex items-center gap-1"><Cloud className="w-2.5 h-2.5 text-blue-300" />{currentWeather.air_temperature?.toFixed(0)}°A</span>
                    <span className="flex items-center gap-1"><Droplets className="w-2.5 h-2.5 text-cyan-400" />{currentWeather.humidity}%</span>
                    <span className="flex items-center gap-1"><Wind className="w-2.5 h-2.5 text-green-400" />{currentWeather.wind_speed?.toFixed(0)}kph</span>
                  </div>
                  {currentWeather.rainfall > 0 && (
                    <div className="text-[9px] font-mono font-bold text-blue-400 mt-1 animate-pulse">RAIN</div>
                  )}
                </div>
              )}

              {/* SVG Track */}
              <div className="w-full" style={{ aspectRatio: `${svgW} / ${svgH}` }}>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full">
                  <defs>
                    <filter id="neonTrack"><feGaussianBlur stdDeviation="6" /><feMerge><feMergeNode /><feMergeNode /></feMerge></filter>
                    <filter id="carGlow"><feGaussianBlur stdDeviation="4" /></filter>
                    <filter id="carGlowSelected"><feGaussianBlur stdDeviation="6" /></filter>
                    <filter id="drsGlow"><feGaussianBlur stdDeviation="3" /></filter>
                  </defs>

                  {/* Track layers */}
                  {trackPath && <>
                    <path d={trackPath} fill="none" stroke="rgba(59,130,246,0.15)" strokeWidth="28" strokeLinejoin="round" strokeLinecap="round" filter="url(#neonTrack)" />
                    <path d={trackPath} fill="none" stroke="rgba(59,130,246,0.4)" strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" />
                    <path d={trackPath} fill="none" stroke="rgba(59,130,246,0.7)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
                    <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  </>}

                  {/* DRS zones — green overlay */}
                  {drsZones.map((zone, i) => (
                    <g key={`drs-${i}`}>
                      <path d={zone.path} fill="none" stroke="rgba(57,181,74,0.2)" strokeWidth="20" strokeLinejoin="round" strokeLinecap="round" filter="url(#drsGlow)" />
                      <path d={zone.path} fill="none" stroke="rgba(57,181,74,0.6)" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
                    </g>
                  ))}

                  {/* Car dots */}
                  {carPositions.map(({ driver, x, y }) => {
                    const color = `#${driver.team_colour || "888888"}`;
                    const isSel = selectedDriver === driver.driver_number;
                    const entry = leaderboard.find((e) => e.driver.driver_number === driver.driver_number);
                    const isDrsOpen = entry?.carData?.drs != null && entry.carData.drs >= 10 && entry.carData.drs <= 14;

                    return (
                      <g key={driver.driver_number} onClick={() => setSelectedDriver(driver.driver_number)} className="cursor-pointer">
                        {/* Outer aura */}
                        <circle cx={x} cy={y} r={isSel ? 18 : 14} fill={color} opacity={0.08}
                          filter={isSel ? "url(#carGlowSelected)" : "url(#carGlow)"} />
                        {/* DRS ring — green when DRS open */}
                        {isDrsOpen && (
                          <circle cx={x} cy={y} r={isSel ? 15 : 11} fill="none" stroke="#39B54A" strokeWidth="2" opacity={0.7} />
                        )}
                        {/* Inner glow */}
                        <circle cx={x} cy={y} r={isSel ? 12 : 9} fill={color} opacity={0.6} />
                        {/* Core */}
                        <circle cx={x} cy={y} r={isSel ? 8 : 6} fill={color} />
                        {/* White center */}
                        <circle cx={x} cy={y} r={isSel ? 3 : 2} fill="white" />
                        {/* Label */}
                        <text x={x + (isSel ? 16 : 11)} y={y + 4} fill={color}
                          fontSize={isSel ? "18" : "13"} fontFamily="Fira Code, monospace" fontWeight="bold"
                          style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
                          {driver.name_acronym}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Leaderboard + Telemetry */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold flex items-center gap-2 text-f1-sub">
                  <Timer className="w-3.5 h-3.5 text-racing-amber" />
                  Leaderboard
                </h2>
                <button
                  onClick={() => setShowTelemetry(!showTelemetry)}
                  className={cn(
                    "text-[9px] font-mono px-2 py-1 rounded-lg transition-all",
                    showTelemetry ? "bg-racing-blue/20 text-racing-blue" : "text-white/30 hover:text-white/50"
                  )}
                >
                  <Gauge className="w-3 h-3 inline mr-1" />
                  {showTelemetry ? "TELEM ON" : "TELEM"}
                </button>
              </div>

              <div className="space-y-1 max-h-[400px] lg:max-h-[560px] overflow-y-auto fade-bottom">
                {showTelemetry ? (
                  // Rich telemetry cards
                  leaderboard.map((entry) => (
                    <TelemetryCard
                      key={entry.driver.driver_number}
                      driver={entry.driver}
                      carData={entry.carData}
                      compound={entry.compound}
                      tireAge={entry.tireAge}
                      interval={entry.interval}
                      gapToLeader={entry.gapToLeader}
                      position={entry.position}
                      isSelected={selectedDriver === entry.driver.driver_number}
                      onSelect={() => setSelectedDriver(entry.driver.driver_number)}
                    />
                  ))
                ) : (
                  // Compact leaderboard
                  leaderboard.map((entry, i) => {
                    const color = `#${entry.driver.team_colour || "888888"}`;
                    const tireColor = TIRE_COLORS[entry.compound] || TIRE_COLORS.UNKNOWN;
                    const isSel = selectedDriver === entry.driver.driver_number;
                    return (
                      <button
                        key={entry.driver.driver_number}
                        onClick={() => setSelectedDriver(entry.driver.driver_number)}
                        className={cn(
                          "flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg transition-all cursor-pointer text-left",
                          isSel ? "bg-white/[0.08] ring-1 ring-[var(--f1-border)]" : "hover:bg-[var(--f1-hover)]"
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
                        <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[11px] font-mono font-bold flex-1 truncate" style={{ color }}>{entry.driver.name_acronym}</span>
                        <span className="text-[9px] font-mono text-white/25 tabular-nums">
                          {entry.gapToLeader !== null && entry.gapToLeader > 0 ? `+${entry.gapToLeader.toFixed(1)}` : ""}
                        </span>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tireColor }} title={`${entry.compound} L${entry.tireAge}`} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Selected Driver Telemetry Bar */}
          {selectedDriver && (() => {
            const d = drivers.find((dr) => dr.driver_number === selectedDriver);
            const entry = leaderboard.find((e) => e.driver.driver_number === selectedDriver);
            if (!d || !entry) return null;
            const color = `#${d.team_colour || "888888"}`;
            const cd = entry.carData;

            return (
              <div className="glass-card px-3 sm:px-4 py-2.5 sm:py-3" style={{ borderLeft: `3px solid ${color}` }}>
                <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                  {/* Driver info */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs" style={{ backgroundColor: `${color}20`, color }}>
                      {d.driver_number}
                    </div>
                    <div>
                      <div className="text-sm font-bold">{d.full_name}</div>
                      <div className="text-[10px] text-[var(--f1-text-dim)]">{d.team_name}</div>
                    </div>
                  </div>

                  {/* Speed */}
                  {cd && (
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-lg sm:text-xl font-mono font-black tabular-nums">{cd.speed}</div>
                        <div className="text-[8px] font-mono text-white/25">KM/H</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm sm:text-base font-mono font-bold text-white/60">G{cd.n_gear}</div>
                        <div className="text-[8px] font-mono text-white/25">GEAR</div>
                      </div>
                      {/* Throttle/Brake mini bars */}
                      <div className="space-y-1 w-20 sm:w-24">
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] font-mono text-white/25 w-4">THR</span>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full bg-racing-green transition-all duration-75" style={{ width: `${cd.throttle}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-white/30 w-6 text-right tabular-nums">{cd.throttle}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] font-mono text-white/25 w-4">BRK</span>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full bg-f1-red transition-all duration-75" style={{ width: `${cd.brake}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-white/30 w-6 text-right tabular-nums">{cd.brake > 0 ? `${cd.brake}%` : ""}</span>
                        </div>
                      </div>
                      {/* DRS indicator */}
                      {cd.drs != null && cd.drs >= 10 && cd.drs <= 14 && (
                        <div className="px-2 py-1 rounded-lg bg-racing-green/20 border border-racing-green/30">
                          <span className="text-[10px] font-mono font-bold text-racing-green">DRS</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tire + Gap */}
                  <div className="flex items-center gap-3 ml-auto">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: TIRE_COLORS[entry.compound] || "#666" }} />
                      <span className="text-[10px] font-mono text-f1-muted">{entry.compound}</span>
                      <span className="text-[10px] font-mono text-white/20">L{entry.tireAge}</span>
                    </div>
                    {entry.gapToLeader !== null && entry.gapToLeader > 0 && (
                      <span className="text-[10px] font-mono text-white/30">+{entry.gapToLeader.toFixed(1)}s</span>
                    )}
                  </div>
                </div>

                {/* Tire strategy progress */}
                <div className="mt-2">
                  <TireProgressBar stints={stints} totalLaps={totalLaps} currentLap={estimatedLap} driverNumber={selectedDriver} />
                </div>
              </div>
            );
          })()}

          {/* Playback Controls */}
          <div className="glass-card px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentFrame(Math.max(0, currentFrame - Math.round(totalFrames * 0.05)))}
                  className="p-2 rounded-xl hover:bg-[var(--f1-hover)] text-f1-muted hover:text-f1-sub transition-colors cursor-pointer touch-manipulation"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={cn(
                    "p-2.5 rounded-xl transition-all cursor-pointer touch-manipulation",
                    isPlaying ? "bg-racing-red/20 text-racing-red" : "bg-racing-blue/20 text-racing-blue"
                  )}
                  style={{ boxShadow: isPlaying ? "0 0 15px rgba(225,6,0,0.3)" : "0 0 15px rgba(59,130,246,0.3)" }}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => setCurrentFrame(Math.min(totalFrames - 1, currentFrame + Math.round(totalFrames * 0.05)))}
                  className="p-2 rounded-xl hover:bg-[var(--f1-hover)] text-f1-muted hover:text-f1-sub transition-colors cursor-pointer touch-manipulation"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Progress bar */}
              <div className="flex-1 relative">
                <input
                  type="range" min={0} max={Math.max(1, totalFrames - 1)} value={currentFrame}
                  onChange={(e) => { setCurrentFrame(Number(e.target.value)); setIsPlaying(false); }}
                  className="w-full h-2 rounded-full appearance-none bg-[var(--f1-hover)] cursor-pointer touch-manipulation
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-racing-blue [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                />
              </div>

              {/* Speed */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {SPEED_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPlaybackSpeed(idx)}
                    className={cn(
                      "px-1 sm:px-1.5 py-1 rounded-lg text-[8px] sm:text-[9px] font-mono font-bold cursor-pointer transition-all touch-manipulation",
                      playbackSpeed === idx ? "bg-racing-blue/20 text-racing-blue" : "text-[var(--f1-text-dim)] hover:text-f1-sub",
                      idx > 3 && "hidden sm:block"
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
        <div className="glass-card p-12 sm:p-20 text-center space-y-3">
          <Flag className="w-12 h-12 text-[var(--f1-text-dim)] mx-auto" />
          <p className="text-f1-muted text-sm">Select a session above to load the replay</p>
          <p className="text-[var(--f1-text-dim)] text-[10px] font-mono">
            Real car positions + telemetry from OpenF1 API · All session types supported
          </p>
        </div>
      )}
    </div>
  );
}
