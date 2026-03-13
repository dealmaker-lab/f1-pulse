"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Radio, Play, Pause, Volume2, VolumeX, Loader2, ChevronDown,
  AlertTriangle, Clock, Flag, SkipForward, SkipBack, Search, X,
  Shield, Zap, CircleAlert, Timer, TriangleAlert, CircleDot, Gauge,
  Filter, Users, Mic, MapPin, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeamLogoUrl, getTeamShortName, getDriverHeadshot, DRIVER_HEADSHOTS } from "@/lib/team-logos";
import { filterAllPastSessions, VALID_SESSION_NAMES } from "@/lib/session-filters";

// ===== Types =====
interface SessionInfo {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  circuit_short_name: string;
  country_name: string;
  year: number;
  meeting_key: number;
}

interface DriverOption {
  name: string;
  code: string;
  team: string;
  teamColor: string;
  number: number;
  headshotUrl?: string;
}

interface ContextEvent {
  type: string;
  message: string;
  flag?: string;
}

interface MessageContext {
  events: ContextEvent[];
  gapToLeader: string | null;
  interval: string | null;
  description?: string;
}

interface RadioMessage {
  date: string;
  driverNumber: number;
  driverCode: string;
  driverName: string;
  team: string;
  teamColor: string;
  headshotUrl?: string;
  recordingUrl: string;
  lapNumber: number | null;
  position: number | null;
  lapTime: number | null;
  context?: MessageContext;
}

/** A GP weekend grouped with all its sessions */
interface MeetingGroup {
  meetingKey: number;
  circuitName: string;
  countryName: string;
  sessions: SessionInfo[];
}

// ===== Helpers =====
function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function formatLapTime(secs: number | null): string {
  if (!secs) return "";
  const mins = Math.floor(secs / 60);
  const remainder = (secs % 60).toFixed(3);
  return mins > 0
    ? `${mins}:${parseFloat(remainder) < 10 ? "0" : ""}${remainder}`
    : `${remainder}s`;
}

function getPositionBadge(pos: number | null): string {
  if (!pos) return "";
  return `P${pos}`;
}

function getPositionColor(pos: number | null): string {
  if (!pos) return "";
  if (pos === 1) return "#FFD700";
  if (pos === 2) return "#C0C0C0";
  if (pos === 3) return "#CD7F32";
  return "";
}

const EVENT_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  yellow_flag: { label: "Yellow Flag", color: "#000", bg: "#FFD700" },
  red_flag: { label: "Red Flag", color: "#fff", bg: "#DC2626" },
  green_flag: { label: "Green Flag", color: "#fff", bg: "#16A34A" },
  safety_car: { label: "Safety Car", color: "#000", bg: "#FFA500" },
  vsc: { label: "VSC", color: "#000", bg: "#FBBF24" },
  drs: { label: "DRS", color: "#fff", bg: "#7C3AED" },
  pit: { label: "Pit Stop", color: "#fff", bg: "#2563EB" },
  track_limits: { label: "Track Limits", color: "#fff", bg: "#6B7280" },
  incident: { label: "Incident", color: "#fff", bg: "#EF4444" },
  chequered: { label: "Chequered Flag", color: "#000", bg: "#E5E7EB" },
  event: { label: "Event", color: "#fff", bg: "#4B5563" },
};

const SESSION_SHORT_LABELS: Record<string, string> = {
  Race: "Race",
  Qualifying: "Quali",
  Sprint: "Sprint",
  "Sprint Qualifying": "SQ",
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
};

// ===== Sub-components =====

function DriverHeadshot({ code, teamColor, headshotUrl, size = "sm" }: {
  code: string; teamColor: string; headshotUrl?: string; size?: "xs" | "sm" | "md";
}) {
  const [imgError, setImgError] = useState(false);
  const url = headshotUrl || getDriverHeadshot(code);
  const sizes = { xs: "w-6 h-6", sm: "w-8 h-8", md: "w-10 h-10" };
  const textSizes = { xs: "text-[8px]", sm: "text-[10px]", md: "text-xs" };

  if (!url || imgError) {
    return (
      <div
        className={cn(sizes[size], "rounded-full flex items-center justify-center font-bold flex-shrink-0", textSizes[size])}
        style={{ backgroundColor: `${teamColor}25`, color: teamColor, border: `2px solid ${teamColor}40` }}
      >
        {code.charAt(0)}
      </div>
    );
  }

  return (
    <div
      className={cn(sizes[size], "rounded-full overflow-hidden flex-shrink-0")}
      style={{ border: `2px solid ${teamColor}40`, backgroundColor: "var(--f1-hover)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={code} className="w-full h-full object-cover object-top" onError={() => setImgError(true)} loading="lazy" />
    </div>
  );
}

function TeamLogo({ teamName, size = "sm" }: { teamName: string; size?: "xs" | "sm" }) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = getTeamLogoUrl(teamName);
  const sizes = { xs: "w-4 h-4", sm: "w-5 h-5" };

  if (!logoUrl || imgError) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={getTeamShortName(teamName)}
      className={cn(sizes[size], "object-contain flex-shrink-0")}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
}

// ===== Main Component =====
export default function RadioPage() {
  const [year, setYear] = useState(2026);
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<RadioMessage[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Audio state
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const YEARS = [2026, 2025, 2024, 2023];

  // ===== Data Fetching =====

  // Fetch sessions for the year
  useEffect(() => {
    setLoadingSessions(true);
    setAllSessions([]);
    setSelectedSession(null);
    fetch(`/api/f1/sessions?year=${year}`)
      .then((r) => r.json())
      .then((data: SessionInfo[]) => {
        if (Array.isArray(data)) {
          const pastOnly = filterAllPastSessions(data);
          setAllSessions(pastOnly);
          // Auto-select most recent race session
          const races = pastOnly.filter((s) => s.session_name === "Race");
          if (races.length) {
            setSelectedSession(races[races.length - 1]);
          } else if (pastOnly.length) {
            setSelectedSession(pastOnly[pastOnly.length - 1]);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, [year]);

  // Fetch radio data for selected session
  useEffect(() => {
    if (!selectedSession) return;
    setLoading(true);
    setMessages([]);
    setDrivers([]);
    setPlayingIdx(null);
    stopAudio();

    fetch(`/api/f1/radio?session_key=${selectedSession.session_key}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
        if (data.drivers) setDrivers(data.drivers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession]);

  // ===== Audio Controls =====
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (progressInterval.current) clearInterval(progressInterval.current);
    setIsPlaying(false);
    setAudioProgress(0);
  }, []);

  const filteredMessages = useMemo(() => {
    let msgs = messages;
    if (selectedTeam) {
      const teamDriverNumbers = drivers
        .filter((d) => d.team === selectedTeam)
        .map((d) => d.number);
      msgs = msgs.filter((m) => teamDriverNumbers.includes(m.driverNumber));
    }
    if (selectedDriver) {
      msgs = msgs.filter((m) => m.driverNumber === selectedDriver);
    }
    return msgs;
  }, [messages, selectedDriver, selectedTeam, drivers]);

  const playMessage = useCallback(
    (idx: number) => {
      const filtered = filteredMessages;
      const msg = filtered[idx];
      if (!msg) return;

      stopAudio();
      const audio = new Audio(msg.recordingUrl);
      audio.muted = muted;
      audioRef.current = audio;
      setPlayingIdx(idx);

      audio.addEventListener("canplaythrough", () => {
        audio.play().catch(() => {});
        setIsPlaying(true);
      });
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setPlayingIdx(null);
        setAudioProgress(0);
        if (progressInterval.current) clearInterval(progressInterval.current);
        if (idx + 1 < filtered.length) {
          setTimeout(() => playMessage(idx + 1), 500);
        }
      });
      audio.addEventListener("error", () => {
        setIsPlaying(false);
        setPlayingIdx(null);
      });

      progressInterval.current = setInterval(() => {
        if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100);
      }, 100);

      audio.load();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredMessages, muted, stopAudio]
  );

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setIsPlaying(true); }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  }, []);

  // Scroll to playing message
  useEffect(() => {
    if (playingIdx !== null) {
      const el = messageRefs.current.get(playingIdx);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playingIdx]);

  // Cleanup
  useEffect(() => { return () => { stopAudio(); }; }, [stopAudio]);

  // ===== Derived Data =====

  // Group sessions by meeting (GP weekend) for the race card grid
  const meetingGroups = useMemo((): MeetingGroup[] => {
    const map = new Map<number, MeetingGroup>();
    for (const s of allSessions) {
      if (!map.has(s.meeting_key)) {
        map.set(s.meeting_key, {
          meetingKey: s.meeting_key,
          circuitName: s.circuit_short_name,
          countryName: s.country_name,
          sessions: [],
        });
      }
      map.get(s.meeting_key)!.sessions.push(s);
    }
    // Sort by first session date (chronological)
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      const aDate = new Date(a.sessions[0].date_start).getTime();
      const bDate = new Date(b.sessions[0].date_start).getTime();
      return aDate - bDate;
    });
    return groups;
  }, [allSessions]);

  // Filter meeting groups by search
  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return meetingGroups;
    const q = searchQuery.toLowerCase();
    return meetingGroups.filter(
      (g) =>
        g.circuitName.toLowerCase().includes(q) ||
        g.countryName.toLowerCase().includes(q)
    );
  }, [meetingGroups, searchQuery]);

  // Group messages by lap
  const messagesByLap = useMemo(() => {
    const groups: Map<number | string, RadioMessage[]> = new Map();
    filteredMessages.forEach((m) => {
      const key = m.lapNumber ?? "pre-race";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return groups;
  }, [filteredMessages]);

  // Unique teams from drivers
  const uniqueTeams = useMemo(() => {
    const teamMap = new Map<string, { name: string; color: string; count: number }>();
    drivers.forEach((d) => {
      if (!teamMap.has(d.team)) {
        teamMap.set(d.team, { name: d.team, color: d.teamColor, count: 0 });
      }
    });
    messages.forEach((m) => {
      const team = teamMap.get(m.team);
      if (team) team.count++;
    });
    return Array.from(teamMap.values()).sort((a, b) => b.count - a.count);
  }, [drivers, messages]);

  // Driver message counts
  const driverCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    messages.forEach((m) => {
      counts[m.driverNumber] = (counts[m.driverNumber] || 0) + 1;
    });
    return counts;
  }, [messages]);

  // Drivers filtered by team
  const displayDrivers = useMemo(() => {
    let drvrs = drivers.filter((d) => driverCounts[d.number]);
    if (selectedTeam) {
      drvrs = drvrs.filter((d) => d.team === selectedTeam);
    }
    return drvrs.sort((a, b) => (driverCounts[b.number] || 0) - (driverCounts[a.number] || 0));
  }, [drivers, driverCounts, selectedTeam]);

  // Currently playing message
  const currentMessage = playingIdx !== null ? filteredMessages[playingIdx] : null;

  // Which meeting is the selected session in?
  const selectedMeetingKey = selectedSession?.meeting_key;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Radio className="w-6 h-6 sm:w-7 sm:h-7 text-racing-red" />
          <h1 className="f1-heading text-f1-2xl sm:text-f1-3xl" style={{ letterSpacing: "0.04em" }}>
            Team Radio
          </h1>
        </div>
        <p className="text-f1-sub text-sm">
          Listen to driver-engineer communications during race sessions
        </p>
      </div>

      {/* ===== TOP BAR: Year tabs + Search ===== */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        {/* Year tabs */}
        <div className="flex items-center gap-1 bg-[var(--f1-card)] rounded-lg border border-[var(--f1-border)] p-0.5">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => {
                setYear(y);
                setSelectedDriver(null);
                setSelectedTeam(null);
                setSearchQuery("");
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer",
                year === y
                  ? "bg-racing-red text-white"
                  : "text-f1-sub hover:text-f1 hover:bg-[var(--f1-hover)]"
              )}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Track search */}
        <div className="relative flex-1 min-w-[140px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted" />
          <input
            type="text"
            placeholder="Search circuit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg border border-[var(--f1-border)] bg-[var(--f1-card)] text-f1 placeholder:text-f1-muted focus:outline-none focus:border-racing-red/50 transition"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer">
              <X className="w-3.5 h-3.5 text-f1-muted hover:text-f1" />
            </button>
          )}
        </div>

        {/* Mobile filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "sm:hidden p-2 rounded-lg border transition cursor-pointer",
            showFilters
              ? "bg-racing-red text-white border-racing-red"
              : "border-[var(--f1-border)] text-f1-sub"
          )}
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* ===== RACE CARDS GRID ===== */}
      {loadingSessions ? (
        <div className="flex items-center justify-center py-10 gap-3">
          <Loader2 className="w-5 h-5 text-racing-red animate-spin" />
          <span className="text-f1-sub text-sm">Loading {year} sessions...</span>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <AlertTriangle className="w-6 h-6 text-f1-muted" />
          <span className="text-f1-sub text-sm">No races found for {year}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 mb-6">
          {filteredMeetings.map((meeting, idx) => {
            const isSelected = selectedMeetingKey === meeting.meetingKey;
            const sessionOrder = ["Race", "Qualifying", "Sprint", "Sprint Qualifying", "Practice 3", "Practice 2", "Practice 1"];
            const sortedSessions = [...meeting.sessions].sort(
              (a, b) => sessionOrder.indexOf(a.session_name) - sessionOrder.indexOf(b.session_name)
            );

            return (
              <div
                key={meeting.meetingKey}
                className={cn(
                  "rounded-xl border p-3 transition-all cursor-pointer group relative",
                  isSelected
                    ? "border-racing-red bg-racing-red/5 ring-1 ring-racing-red/30"
                    : "border-[var(--f1-border)] bg-[var(--f1-card)] hover:border-racing-red/40"
                )}
                onClick={() => {
                  // Select the Race session by default, or first available
                  const race = meeting.sessions.find((s) => s.session_name === "Race");
                  setSelectedSession(race || meeting.sessions[0]);
                  setSelectedDriver(null);
                  setSelectedTeam(null);
                }}
              >
                {/* Round number */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    isSelected ? "text-racing-red" : "text-f1-muted"
                  )}>
                    R{String(idx + 1).padStart(2, "0")}
                  </span>
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-racing-red animate-pulse" />
                  )}
                </div>

                {/* Circuit + Country */}
                <div className="flex items-center gap-1.5 mb-2">
                  <MapPin className="w-3 h-3 text-f1-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-f1 truncate">{meeting.circuitName}</div>
                    <div className="text-[10px] text-f1-muted truncate">{meeting.countryName}</div>
                  </div>
                </div>

                {/* Session type pills */}
                <div className="flex flex-wrap gap-1">
                  {sortedSessions.map((s) => {
                    const isActiveSession = selectedSession?.session_key === s.session_key;
                    return (
                      <button
                        key={s.session_key}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSession(s);
                          setSelectedDriver(null);
                          setSelectedTeam(null);
                        }}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                          isActiveSession
                            ? "bg-racing-red text-white"
                            : isSelected
                              ? "bg-racing-red/15 text-racing-red hover:bg-racing-red/25"
                              : "bg-[var(--f1-hover)] text-f1-muted hover:text-f1"
                        )}
                      >
                        {SESSION_SHORT_LABELS[s.session_name] || s.session_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== SELECTED SESSION HEADER ===== */}
      {selectedSession && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <Flag className="w-4 h-4 text-racing-red" />
          <span className="text-sm font-bold text-f1">
            {selectedSession.circuit_short_name} — {selectedSession.country_name}
          </span>
          <span className="px-2 py-0.5 rounded bg-racing-red/15 text-racing-red text-xs font-bold">
            {selectedSession.session_name}
          </span>
          {messages.length > 0 && (
            <span className="text-xs text-f1-muted ml-auto">
              {messages.length} messages
            </span>
          )}
        </div>
      )}

      {/* ===== DRIVER & TEAM FILTERS ===== */}
      {selectedSession && !loading && drivers.length > 0 && (
        <div className={cn("space-y-3 mb-6", showFilters || "hidden sm:block")}>
          {/* Team pills */}
          {uniqueTeams.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-3.5 h-3.5 text-f1-muted" />
                <span className="text-[10px] font-bold text-f1-muted uppercase tracking-wider">Teams</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => { setSelectedTeam(null); setSelectedDriver(null); }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border",
                    !selectedTeam
                      ? "bg-racing-red text-white border-racing-red"
                      : "text-f1-sub border-[var(--f1-border)] hover:border-racing-red/50"
                  )}
                >
                  All Teams
                </button>
                {uniqueTeams.map((team) => (
                  <button
                    key={team.name}
                    onClick={() => {
                      setSelectedTeam(selectedTeam === team.name ? null : team.name);
                      setSelectedDriver(null);
                    }}
                    className={cn(
                      "px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                      "border flex items-center gap-1.5",
                      selectedTeam === team.name
                        ? "text-white border-transparent"
                        : "text-f1-sub border-[var(--f1-border)] hover:border-opacity-60"
                    )}
                    style={
                      selectedTeam === team.name
                        ? { backgroundColor: team.color, borderColor: team.color }
                        : { borderColor: `${team.color}40` }
                    }
                  >
                    <TeamLogo teamName={team.name} size="xs" />
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    {getTeamShortName(team.name)}
                    <span className="opacity-60">({team.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Driver pills with headshots */}
          {displayDrivers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-3.5 h-3.5 text-f1-muted" />
                <span className="text-[10px] font-bold text-f1-muted uppercase tracking-wider">Drivers</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {displayDrivers.map((d) => (
                  <button
                    key={d.number}
                    onClick={() => setSelectedDriver(selectedDriver === d.number ? null : d.number)}
                    className={cn(
                      "pl-1 pr-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer",
                      "border flex items-center gap-1.5",
                      selectedDriver === d.number
                        ? "text-white border-transparent"
                        : "text-f1-sub border-[var(--f1-border)] hover:border-opacity-60"
                    )}
                    style={
                      selectedDriver === d.number
                        ? { backgroundColor: d.teamColor, borderColor: d.teamColor }
                        : { borderColor: `${d.teamColor}40` }
                    }
                  >
                    <DriverHeadshot code={d.code} teamColor={d.teamColor} headshotUrl={d.headshotUrl} size="xs" />
                    <span style={selectedDriver !== d.number ? { color: d.teamColor } : {}}>{d.code}</span>
                    <span className="opacity-60">({driverCounts[d.number] || 0})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 className="w-6 h-6 text-racing-red animate-spin" />
          <span className="text-f1-sub text-sm">Loading radio messages...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredMessages.length === 0 && selectedSession && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <AlertTriangle className="w-8 h-8 text-f1-muted" />
          <span className="text-f1-sub text-sm">
            {messages.length > 0
              ? "No messages match your filters"
              : "No radio messages available for this session"}
          </span>
          {(selectedDriver || selectedTeam) && messages.length > 0 && (
            <button
              onClick={() => { setSelectedDriver(null); setSelectedTeam(null); }}
              className="text-racing-red text-xs font-semibold hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ===== STICKY AUDIO PLAYER ===== */}
      {currentMessage && (
        <div className="sticky top-12 lg:top-0 z-30 mb-4">
          <div
            className="rounded-xl p-3 sm:p-4 border backdrop-blur-xl"
            style={{
              backgroundColor: "var(--f1-card)",
              borderColor: currentMessage.teamColor + "40",
              boxShadow: `0 4px 24px ${currentMessage.teamColor}15`,
            }}
          >
            {/* Progress bar */}
            <div className="w-full h-1 rounded-full bg-[var(--f1-border)] mb-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{ width: `${audioProgress}%`, backgroundColor: currentMessage.teamColor }}
              />
            </div>

            <div className="flex items-center gap-3">
              <DriverHeadshot
                code={currentMessage.driverCode}
                teamColor={currentMessage.teamColor}
                headshotUrl={currentMessage.headshotUrl}
                size="md"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                    style={{ backgroundColor: currentMessage.teamColor }}
                  >
                    {currentMessage.driverCode}
                  </span>
                  <span className="text-f1 text-sm font-semibold truncate">
                    {currentMessage.driverName}
                  </span>
                </div>
                <div className="text-f1-muted text-xs flex items-center gap-2 mt-0.5">
                  <TeamLogo teamName={currentMessage.team} size="xs" />
                  <span>{getTeamShortName(currentMessage.team)}</span>
                  {currentMessage.lapNumber && (
                    <>
                      <span className="text-f1-muted/40">·</span>
                      <span>Lap {currentMessage.lapNumber}</span>
                    </>
                  )}
                  {currentMessage.position && (
                    <>
                      <span className="text-f1-muted/40">·</span>
                      <span
                        className="font-bold"
                        style={{ color: getPositionColor(currentMessage.position) || currentMessage.teamColor }}
                      >
                        {getPositionBadge(currentMessage.position)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => playingIdx !== null && playingIdx > 0 && playMessage(playingIdx - 1)}
                  className="p-2 rounded-lg hover:bg-[var(--f1-hover)] transition cursor-pointer"
                  disabled={playingIdx === 0}
                >
                  <SkipBack className={cn("w-4 h-4", playingIdx === 0 ? "text-f1-muted/30" : "text-f1-sub")} />
                </button>
                <button
                  onClick={togglePlayPause}
                  className="p-2.5 rounded-full cursor-pointer"
                  style={{ backgroundColor: currentMessage.teamColor }}
                >
                  {isPlaying
                    ? <Pause className="w-4 h-4 text-white" />
                    : <Play className="w-4 h-4 text-white ml-0.5" />}
                </button>
                <button
                  onClick={() => playingIdx !== null && playingIdx + 1 < filteredMessages.length && playMessage(playingIdx + 1)}
                  className="p-2 rounded-lg hover:bg-[var(--f1-hover)] transition cursor-pointer"
                  disabled={playingIdx === null || playingIdx === filteredMessages.length - 1}
                >
                  <SkipForward className={cn("w-4 h-4", (playingIdx === null || playingIdx === filteredMessages.length - 1) ? "text-f1-muted/30" : "text-f1-sub")} />
                </button>
                <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-[var(--f1-hover)] transition cursor-pointer">
                  {muted ? <VolumeX className="w-4 h-4 text-f1-sub" /> : <Volume2 className="w-4 h-4 text-f1-sub" />}
                </button>
              </div>
            </div>

            {/* Context for playing message */}
            {currentMessage.context && currentMessage.context.events.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-[var(--f1-border)]">
                <span className="text-[10px] text-f1-muted uppercase tracking-wider mr-1">On Track:</span>
                {currentMessage.context.events.map((evt, i) => {
                  const badge = EVENT_BADGES[evt.type] || EVENT_BADGES.event;
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                      title={evt.message}
                    >
                      {badge.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== MESSAGE TIMELINE ===== */}
      {!loading && filteredMessages.length > 0 && (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-px bg-[var(--f1-border)]" />

          {Array.from(messagesByLap.entries()).map(([lapKey, lapMessages]) => (
            <div key={String(lapKey)} className="mb-6">
              {/* Lap header */}
              <div className="relative flex items-center gap-3 mb-3 pl-10 sm:pl-14">
                <div className="absolute left-2.5 sm:left-4.5 w-3 h-3 rounded-full bg-racing-red border-2 border-[var(--f1-bg)]" />
                <div className="flex items-center gap-2">
                  <Flag className="w-3.5 h-3.5 text-racing-red" />
                  <span className="text-xs font-bold text-racing-red uppercase tracking-wider">
                    {lapKey === "pre-race" ? "Pre-Race" : `Lap ${lapKey}`}
                  </span>
                  <span className="text-[10px] text-f1-muted">
                    ({lapMessages.length} message{lapMessages.length !== 1 ? "s" : ""})
                  </span>
                </div>
              </div>

              {/* Messages in this lap */}
              <div className="space-y-2">
                {lapMessages.map((msg) => {
                  const flatIdx = filteredMessages.indexOf(msg);
                  const isCurrentlyPlaying = playingIdx === flatIdx;

                  return (
                    <div
                      key={`${msg.date}-${msg.driverNumber}`}
                      ref={(el) => { if (el) messageRefs.current.set(flatIdx, el); }}
                      onClick={() => playMessage(flatIdx)}
                      className={cn(
                        "relative ml-10 sm:ml-14 rounded-xl p-3 sm:p-4 border cursor-pointer transition-all duration-200 group",
                        isCurrentlyPlaying ? "ring-1" : "hover:border-opacity-60"
                      )}
                      style={{
                        backgroundColor: isCurrentlyPlaying ? `${msg.teamColor}08` : "var(--f1-card)",
                        borderColor: isCurrentlyPlaying ? msg.teamColor : "var(--f1-border)",
                        ...(isCurrentlyPlaying ? { ringColor: msg.teamColor } : {}),
                      }}
                    >
                      {/* Timeline dot */}
                      <div
                        className={cn("absolute w-2 h-2 rounded-full top-5 left-[-26px] sm:left-[-30px]")}
                        style={{ backgroundColor: isCurrentlyPlaying ? msg.teamColor : "var(--f1-border)" }}
                      />

                      <div className="flex items-start gap-2.5 sm:gap-3">
                        {/* Driver headshot */}
                        <DriverHeadshot
                          code={msg.driverCode}
                          teamColor={msg.teamColor}
                          headshotUrl={msg.headshotUrl}
                          size="sm"
                        />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="text-xs font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                                style={{ backgroundColor: msg.teamColor }}
                              >
                                {msg.driverCode}
                              </span>
                              <span className="text-f1 text-sm font-medium truncate" style={{ color: msg.teamColor }}>
                                {msg.driverName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {msg.position && (
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: getPositionColor(msg.position) || "var(--f1-text-dim)" }}
                                >
                                  {getPositionBadge(msg.position)}
                                </span>
                              )}
                              <span className="text-xs text-f1-muted flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(msg.date)}
                              </span>
                            </div>
                          </div>

                          {/* Team + lap time row */}
                          <div className="flex items-center gap-2 text-xs text-f1-muted">
                            <TeamLogo teamName={msg.team} size="xs" />
                            <span style={{ color: `${msg.teamColor}CC` }}>{getTeamShortName(msg.team)}</span>
                            {msg.lapTime && (
                              <>
                                <span className="text-f1-muted/40">·</span>
                                <span>Lap: {formatLapTime(msg.lapTime)}</span>
                              </>
                            )}
                          </div>

                          {/* On-track context badges */}
                          {msg.context && (msg.context.events.length > 0 || msg.context.gapToLeader || msg.context.interval) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              {msg.context.events.map((evt, i) => {
                                const badge = EVENT_BADGES[evt.type] || EVENT_BADGES.event;
                                return (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                    style={{ backgroundColor: badge.bg, color: badge.color }}
                                    title={evt.message}
                                  >
                                    {evt.type === "safety_car" && <Shield className="w-2.5 h-2.5" />}
                                    {evt.type === "yellow_flag" && <TriangleAlert className="w-2.5 h-2.5" />}
                                    {evt.type === "red_flag" && <CircleAlert className="w-2.5 h-2.5" />}
                                    {evt.type === "incident" && <Zap className="w-2.5 h-2.5" />}
                                    {evt.type === "vsc" && <Timer className="w-2.5 h-2.5" />}
                                    {evt.type === "pit" && <CircleDot className="w-2.5 h-2.5" />}
                                    {badge.label}
                                  </span>
                                );
                              })}
                              {msg.context.gapToLeader && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[var(--f1-border)] text-f1-sub">
                                  <Gauge className="w-2.5 h-2.5" />
                                  Gap: {msg.context.gapToLeader}s
                                </span>
                              )}
                              {msg.context.interval && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[var(--f1-border)] text-f1-sub">
                                  Int: {msg.context.interval}s
                                </span>
                              )}
                            </div>
                          )}

                          {/* Context description */}
                          {msg.context?.description && (
                            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-[var(--f1-hover)] text-[11px] text-f1-sub leading-relaxed">
                              {msg.context.description}
                            </div>
                          )}
                        </div>

                        {/* Play indicator */}
                        <div
                          className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
                            isCurrentlyPlaying ? "" : "bg-[var(--f1-hover)] group-hover:bg-racing-red/20"
                          )}
                          style={isCurrentlyPlaying ? { backgroundColor: msg.teamColor } : {}}
                        >
                          {isCurrentlyPlaying && isPlaying ? (
                            <Pause className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Play
                              className={cn(
                                "w-3.5 h-3.5 ml-0.5",
                                isCurrentlyPlaying ? "text-white" : "text-f1-muted group-hover:text-racing-red"
                              )}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== STATS SUMMARY ===== */}
      {!loading && filteredMessages.length > 0 && (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="text-2xl font-black text-f1">{filteredMessages.length}</div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">Messages</div>
          </div>
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="text-2xl font-black text-f1">
              {new Set(filteredMessages.map((m) => m.driverNumber)).size}
            </div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">Drivers</div>
          </div>
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="text-2xl font-black text-f1">{messagesByLap.size}</div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">Laps Covered</div>
          </div>
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="flex items-center gap-2">
              {(() => {
                const topDriverNum = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0];
                const topDriver = drivers.find((d) => d.number === Number(topDriverNum?.[0]));
                if (!topDriver) return <span className="text-2xl font-black text-f1">-</span>;
                return (
                  <>
                    <DriverHeadshot code={topDriver.code} teamColor={topDriver.teamColor} headshotUrl={topDriver.headshotUrl} size="sm" />
                    <span className="text-lg font-black" style={{ color: topDriver.teamColor }}>
                      {topDriver.code}
                    </span>
                  </>
                );
              })()}
            </div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">Most Active</div>
          </div>
        </div>
      )}
    </div>
  );
}
