"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Radio, Play, Pause, Volume2, VolumeX, Loader2, ChevronDown,
  AlertTriangle, Clock, MapPin, User, Flag, SkipForward, SkipBack,
  Shield, Zap, CircleAlert, Timer, TriangleAlert, CircleDot, Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ===== Types =====
interface SessionInfo {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  circuit_short_name: string;
  country_name: string;
  year: number;
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

// ===== Helpers =====
function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
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
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `P${pos}`;
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

// ===== Component =====
export default function RadioPage() {
  const [year, setYear] = useState(2025);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<RadioMessage[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Audio state
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020];

  // Fetch sessions
  useEffect(() => {
    setLoadingSessions(true);
    fetch(`/api/f1/sessions?year=${year}`)
      .then((r) => r.json())
      .then((data: SessionInfo[]) => {
        if (Array.isArray(data)) {
          // Filter to Race and Qualifying sessions only (most radio)
          const filtered = data.filter(
            (s) =>
              s.session_type === "Race" ||
              s.session_type === "Qualifying" ||
              s.session_type === "Sprint" ||
              s.session_type === "Sprint Qualifying"
          );
          // Sort by date descending
          filtered.sort(
            (a, b) =>
              new Date(b.date_start).getTime() -
              new Date(a.date_start).getTime()
          );
          setSessions(filtered);
          // Always auto-select the most recent session when sessions load
          if (filtered.length > 0) {
            setSelectedSession(filtered[0]);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, [year]);

  // Fetch radio data
  useEffect(() => {
    if (!selectedSession) return;
    setLoading(true);
    setMessages([]);
    setDrivers([]);
    setPlayingIdx(null);
    stopAudio();

    const driverParam = selectedDriver
      ? `&driver_number=${selectedDriver}`
      : "";

    fetch(
      `/api/f1/radio?session_key=${selectedSession.session_key}${driverParam}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
        if (data.drivers && selectedDriver === null) setDrivers(data.drivers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedSession, selectedDriver]);

  // Audio controls
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    setIsPlaying(false);
    setAudioProgress(0);
  }, []);

  const playMessage = useCallback(
    (idx: number) => {
      const msg = messages[idx];
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
        // Auto-play next message
        if (idx + 1 < messages.length) {
          setTimeout(() => playMessage(idx + 1), 500);
        }
      });

      audio.addEventListener("error", () => {
        setIsPlaying(false);
        setPlayingIdx(null);
      });

      // Progress tracker
      progressInterval.current = setInterval(() => {
        if (audio.duration) {
          setAudioProgress((audio.currentTime / audio.duration) * 100);
        }
      }, 100);

      audio.load();
    },
    [messages, muted, stopAudio]
  );

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  }, []);

  const skipNext = useCallback(() => {
    if (playingIdx !== null && playingIdx + 1 < messages.length) {
      playMessage(playingIdx + 1);
    }
  }, [playingIdx, messages.length, playMessage]);

  const skipPrev = useCallback(() => {
    if (playingIdx !== null && playingIdx > 0) {
      playMessage(playingIdx - 1);
    }
  }, [playingIdx, playMessage]);

  // Scroll to playing message
  useEffect(() => {
    if (playingIdx !== null) {
      const el = messageRefs.current.get(playingIdx);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [playingIdx]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  // Group messages by lap
  const messagesByLap = useMemo(() => {
    const groups: Map<number | string, RadioMessage[]> = new Map();
    messages.forEach((m) => {
      const key = m.lapNumber ?? "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return groups;
  }, [messages]);

  // Driver filter counts
  const driverCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    messages.forEach((m) => {
      counts[m.driverNumber] = (counts[m.driverNumber] || 0) + 1;
    });
    return counts;
  }, [messages]);

  // Get flat index for a message
  const getFlatIdx = (msg: RadioMessage) =>
    messages.findIndex(
      (m) => m.date === msg.date && m.driverNumber === msg.driverNumber
    );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Radio className="w-6 h-6 sm:w-7 sm:h-7 text-racing-red" />
          <h1
            className="f1-heading text-f1-2xl sm:text-f1-3xl"
            style={{ letterSpacing: "0.04em" }}
          >
            Team Radio
          </h1>
        </div>
        <p className="text-f1-sub text-sm">
          Listen to driver-engineer communications during race sessions
        </p>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Year selector */}
        <div className="relative">
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setSelectedSession(null);
              setSelectedDriver(null);
            }}
            className="f1-select text-sm pr-8 min-w-[90px]"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-f1-muted pointer-events-none" />
        </div>

        {/* Session selector */}
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:flex-none">
          <select
            value={selectedSession?.session_key || ""}
            onChange={(e) => {
              const session = sessions.find(
                (s) => s.session_key === Number(e.target.value)
              );
              setSelectedSession(session || null);
              setSelectedDriver(null);
            }}
            className="f1-select text-sm w-full pr-8"
            disabled={loadingSessions}
          >
            {sessions.length === 0 && (
              <option value="">
                {loadingSessions ? "Loading..." : "No sessions"}
              </option>
            )}
            {sessions.map((s) => (
              <option key={s.session_key} value={s.session_key}>
                {s.circuit_short_name} — {s.country_name} ({s.session_name})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-f1-muted pointer-events-none" />
        </div>
      </div>

      {/* Driver Filter Pills */}
      {drivers.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedDriver(null)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                "border",
                selectedDriver === null
                  ? "bg-racing-red text-white border-racing-red"
                  : "text-f1-sub border-[var(--f1-border)] hover:border-racing-red/50"
              )}
            >
              All Drivers ({messages.length})
            </button>
            {drivers
              .filter((d) => driverCounts[d.number])
              .sort(
                (a, b) =>
                  (driverCounts[b.number] || 0) -
                  (driverCounts[a.number] || 0)
              )
              .map((d) => (
                <button
                  key={d.number}
                  onClick={() =>
                    setSelectedDriver(
                      selectedDriver === d.number ? null : d.number
                    )
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
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
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: d.teamColor }}
                  />
                  {d.code}
                  <span className="opacity-60">({driverCounts[d.number] || 0})</span>
                </button>
              ))}
          </div>
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
      {!loading && messages.length === 0 && selectedSession && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <AlertTriangle className="w-8 h-8 text-f1-muted" />
          <span className="text-f1-sub text-sm">
            No radio messages available for this session
          </span>
        </div>
      )}

      {/* Audio Player Bar (sticky) */}
      {playingIdx !== null && messages[playingIdx] && (
        <div className="sticky top-12 lg:top-0 z-30 mb-4">
          <div
            className="rounded-xl p-3 sm:p-4 border backdrop-blur-xl"
            style={{
              backgroundColor: "var(--f1-card)",
              borderColor: messages[playingIdx].teamColor + "40",
              boxShadow: `0 4px 24px ${messages[playingIdx].teamColor}15`,
            }}
          >
            {/* Progress bar */}
            <div className="w-full h-1 rounded-full bg-[var(--f1-border)] mb-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${audioProgress}%`,
                  backgroundColor: messages[playingIdx].teamColor,
                }}
              />
            </div>

            <div className="flex items-center gap-3">
              {/* Driver badge */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                style={{ backgroundColor: messages[playingIdx].teamColor }}
              >
                {messages[playingIdx].driverCode}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-f1 text-sm font-semibold truncate">
                  {messages[playingIdx].driverName}
                </div>
                <div className="text-f1-muted text-xs flex items-center gap-2">
                  <span>{messages[playingIdx].team}</span>
                  {messages[playingIdx].lapNumber && (
                    <>
                      <span className="text-f1-muted/40">•</span>
                      <span>Lap {messages[playingIdx].lapNumber}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={skipPrev}
                  className="p-2 rounded-lg hover:bg-[var(--f1-hover)] transition cursor-pointer"
                  disabled={playingIdx === 0}
                >
                  <SkipBack
                    className={cn(
                      "w-4 h-4",
                      playingIdx === 0 ? "text-f1-muted/30" : "text-f1-sub"
                    )}
                  />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="p-2.5 rounded-full cursor-pointer"
                  style={{ backgroundColor: messages[playingIdx].teamColor }}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 text-white" />
                  ) : (
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  )}
                </button>

                <button
                  onClick={skipNext}
                  className="p-2 rounded-lg hover:bg-[var(--f1-hover)] transition cursor-pointer"
                  disabled={playingIdx === messages.length - 1}
                >
                  <SkipForward
                    className={cn(
                      "w-4 h-4",
                      playingIdx === messages.length - 1
                        ? "text-f1-muted/30"
                        : "text-f1-sub"
                    )}
                  />
                </button>

                <button
                  onClick={toggleMute}
                  className="p-2 rounded-lg hover:bg-[var(--f1-hover)] transition cursor-pointer"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-f1-sub" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-f1-sub" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {!loading && messages.length > 0 && (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-px bg-[var(--f1-border)]" />

          {Array.from(messagesByLap.entries()).map(
            ([lapKey, lapMessages]) => (
              <div key={String(lapKey)} className="mb-6">
                {/* Lap header */}
                <div className="relative flex items-center gap-3 mb-3 pl-10 sm:pl-14">
                  <div className="absolute left-2.5 sm:left-4.5 w-3 h-3 rounded-full bg-racing-red border-2 border-[var(--f1-bg)]" />
                  <div className="flex items-center gap-2">
                    <Flag className="w-3.5 h-3.5 text-racing-red" />
                    <span className="text-xs font-bold text-racing-red uppercase tracking-wider">
                      {lapKey === "unknown"
                        ? "Pre-Race"
                        : `Lap ${lapKey}`}
                    </span>
                  </div>
                </div>

                {/* Messages in this lap */}
                <div className="space-y-2">
                  {lapMessages.map((msg) => {
                    const flatIdx = getFlatIdx(msg);
                    const isCurrentlyPlaying = playingIdx === flatIdx;

                    return (
                      <div
                        key={`${msg.date}-${msg.driverNumber}`}
                        ref={(el) => {
                          if (el) messageRefs.current.set(flatIdx, el);
                        }}
                        onClick={() => playMessage(flatIdx)}
                        className={cn(
                          "relative ml-10 sm:ml-14 rounded-xl p-3 sm:p-4 border cursor-pointer transition-all duration-200 group",
                          isCurrentlyPlaying
                            ? "ring-1"
                            : "hover:border-opacity-60"
                        )}
                        style={{
                          backgroundColor: isCurrentlyPlaying
                            ? `${msg.teamColor}08`
                            : "var(--f1-card)",
                          borderColor: isCurrentlyPlaying
                            ? msg.teamColor
                            : "var(--f1-border)",
                          ...(isCurrentlyPlaying
                            ? { ringColor: msg.teamColor }
                            : {}),
                        }}
                      >
                        {/* Timeline dot */}
                        <div
                          className={cn(
                            "absolute w-2 h-2 rounded-full top-5",
                            "left-[-26px] sm:left-[-30px]"
                          )}
                          style={{
                            backgroundColor: isCurrentlyPlaying
                              ? msg.teamColor
                              : "var(--f1-border)",
                          }}
                        />

                        <div className="flex items-start gap-3">
                          {/* Driver color bar */}
                          <div
                            className="w-1 self-stretch rounded-full flex-shrink-0"
                            style={{ backgroundColor: msg.teamColor }}
                          />

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="text-xs font-bold px-2 py-0.5 rounded text-white flex-shrink-0"
                                  style={{
                                    backgroundColor: msg.teamColor,
                                  }}
                                >
                                  {msg.driverCode}
                                </span>
                                <span className="text-f1 text-sm font-medium truncate">
                                  {msg.driverName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {msg.position && (
                                  <span className="text-xs text-f1-muted">
                                    {getPositionBadge(msg.position)}
                                  </span>
                                )}
                                <span className="text-xs text-f1-muted flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(msg.date)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-f1-muted">
                              <span>{msg.team}</span>
                              {msg.lapTime && (
                                <>
                                  <span className="text-f1-muted/40">•</span>
                                  <span>
                                    Lap time: {formatLapTime(msg.lapTime)}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* On-track context */}
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
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[var(--f1-border)] text-f1-sub"
                                  >
                                    <Gauge className="w-2.5 h-2.5" />
                                    Gap: {msg.context.gapToLeader}s
                                  </span>
                                )}
                                {msg.context.interval && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[var(--f1-border)] text-f1-sub"
                                  >
                                    Int: {msg.context.interval}s
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Play indicator */}
                          <div
                            className={cn(
                              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
                              isCurrentlyPlaying
                                ? ""
                                : "bg-[var(--f1-hover)] group-hover:bg-racing-red/20"
                            )}
                            style={
                              isCurrentlyPlaying
                                ? { backgroundColor: msg.teamColor }
                                : {}
                            }
                          >
                            {isCurrentlyPlaying && isPlaying ? (
                              <Pause className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <Play
                                className={cn(
                                  "w-3.5 h-3.5 ml-0.5",
                                  isCurrentlyPlaying
                                    ? "text-white"
                                    : "text-f1-muted group-hover:text-racing-red"
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
            )
          )}
        </div>
      )}

      {/* Stats summary */}
      {!loading && messages.length > 0 && (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="text-2xl font-black text-f1">
              {messages.length}
            </div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">
              Messages
            </div>
          </div>
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="text-2xl font-black text-f1">
              {new Set(messages.map((m) => m.driverNumber)).size}
            </div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">
              Drivers
            </div>
          </div>
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="text-2xl font-black text-f1">
              {messagesByLap.size}
            </div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">
              Laps Covered
            </div>
          </div>
          <div className="rounded-xl p-4 border border-[var(--f1-border)] bg-[var(--f1-card)]">
            <div className="text-2xl font-black text-f1 truncate text-lg">
              {drivers.length > 0
                ? (() => {
                    const top = Object.entries(driverCounts).sort(
                      (a, b) => b[1] - a[1]
                    )[0];
                    const d = drivers.find(
                      (dr) => dr.number === Number(top?.[0])
                    );
                    return d?.code || "-";
                  })()
                : "-"}
            </div>
            <div className="text-xs text-f1-muted uppercase tracking-wider mt-1">
              Most Active
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
