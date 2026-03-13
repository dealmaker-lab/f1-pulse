"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Trophy, Flag, Timer, TrendingUp, ChevronRight,
  Calendar, MapPin, Loader2, ArrowRight, Zap, ChevronDown,
} from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";
import { getTeamLogoUrl, getTeamInfo } from "@/lib/team-logos";
import { useIsRaceWeekend } from "@/hooks/use-live-polling";
import ChampionshipChart from "@/components/charts/championship-chart";
import ConstructorBarChart from "@/components/charts/constructor-bar-chart";
import { DriverStanding, ConstructorStanding } from "@/types/f1";
import PredictionPanel from "@/components/predictions/prediction-panel";
import CircuitMap from "@/components/circuit-map/circuit-map";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SessionInfo {
  session_key: number;
  session_name: string;
  date_start: string;
  meeting_key: number;
  circuit_short_name: string;
  country_name: string;
}

interface MeetingInfo {
  meeting_key: number;
  meeting_name: string;
  circuit_short_name: string;
  country_name: string;
}

interface ApiDriverStanding {
  position: number;
  points: number;
  wins: number;
  driver: {
    code: string;
    name: string;
    number: number;
    nationality: string;
    team: string;
    teamColor: string;
  };
}

interface ApiConstructorStanding {
  position: number;
  points: number;
  wins: number;
  team: string;
  teamColor: string;
}

interface RaceResultEntry {
  round: number;
  raceName: string;
  circuit: string;
  country: string;
  date: string;
  results: {
    position: number;
    driver: {
      code: string;
      name: string;
      number: number;
      team: string;
      teamColor: string;
    };
    points: number;
    grid: number;
    laps: number;
    status: string;
    time: string | null;
  }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const YEARS = [2025, 2024, 2023, 2022, 2021, 2020];

// ─── Subcomponents ─────────────────────────────────────────────────────────

/** Podium position card for the latest result hero */
function PodiumCard({
  position,
  driver,
  time,
  gridPos,
}: {
  position: number;
  driver: { code: string; name: string; team: string; teamColor: string };
  time: string | null;
  gridPos: number;
}) {
  const color = driver.teamColor || getTeamColor(driver.team);
  const isWinner = position === 1;
  const gainedPositions = gridPos - position;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-300",
        isWinner
          ? "col-span-2 sm:col-span-1"
          : "bg-[var(--f1-hover)]"
      )}
      style={{
        background: isWinner
          ? `linear-gradient(135deg, ${color}15, ${color}05)`
          : undefined,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="p-4 sm:p-5">
        {/* Position */}
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "font-display font-black",
              isWinner ? "text-4xl sm:text-5xl" : "text-3xl"
            )}
            style={{ color: position === 1 ? "#ffc906" : position === 2 ? "var(--f1-text-sub)" : "#cd7f32" }}
          >
            P{position}
          </span>
          {gainedPositions > 0 && (
            <span className="text-[10px] font-mono font-bold text-racing-green bg-racing-green/10 px-1.5 py-0.5 rounded">
              +{gainedPositions}
            </span>
          )}
          {gainedPositions < 0 && (
            <span className="text-[10px] font-mono font-bold text-f1-red bg-f1-red/10 px-1.5 py-0.5 rounded">
              {gainedPositions}
            </span>
          )}
        </div>

        {/* Driver */}
        <div className="mt-2">
          <div
            className={cn(
              "font-display font-black uppercase tracking-tight",
              isWinner ? "text-xl sm:text-2xl" : "text-lg"
            )}
          >
            {driver.name.split(" ").pop()}
          </div>
          <div className="text-[10px] uppercase tracking-[0.15em] mt-0.5" style={{ color }}>
            {driver.team}
          </div>
        </div>

        {/* Time */}
        {time && (
          <div className="mt-3 text-xs font-mono text-f1-muted">
            {time}
          </div>
        )}
      </div>

      {/* Team color accent line at bottom */}
      <div
        className="h-[2px] w-full"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
      />
    </div>
  );
}

/** Standing row for the sidebar list */
function StandingRow({
  position,
  name,
  team,
  points,
  wins,
  teamColor,
  isSelected,
  onClick,
}: {
  position: number;
  name: string;
  team: string;
  points: number;
  wins: number;
  teamColor: string;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const color = teamColor || getTeamColor(team);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg transition-all duration-200 group",
        isSelected
          ? "bg-black/[0.04] dark:bg-white/[0.06]"
          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
      )}
    >
      {/* Position */}
      <span
        className={cn(
          "w-6 text-right font-display font-black text-sm flex-shrink-0",
          position === 1 && "text-[#ffc906]",
          position === 2 && "text-[var(--f1-text-sub)]",
          position === 3 && "text-[#cd7f32]",
          position > 3 && "text-[var(--f1-text-dim)]"
        )}
      >
        {position}
      </span>

      {/* Team logo */}
      {(() => {
        const logoUrl = getTeamLogoUrl(team);
        return logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="w-5 h-5 object-contain flex-shrink-0" loading="lazy" />
        ) : (
          <div className="w-[3px] h-5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        );
      })()}

      {/* Name + team */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate group-hover:text-f1 transition-colors">
          {name}
        </div>
        <div className="text-[10px] truncate" style={{ color }}>{team}</div>
      </div>

      {/* Points */}
      <div className="text-right flex-shrink-0">
        <div className="font-mono text-sm font-bold tabular-nums">{points}</div>
        {wins > 0 && (
          <div className="text-[9px] font-mono text-racing-amber/60">
            {wins}W
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [year, setYear] = useState(2025);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [meetings, setMeetings] = useState<MeetingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState("VER");
  const [activeTab, setActiveTab] = useState<"drivers" | "constructors">("drivers");

  // Race selector — "all" means season overview, otherwise a specific round
  const [selectedRound, setSelectedRound] = useState<"latest" | number>("latest");

  const [driverStandings, setDriverStandings] = useState<ApiDriverStanding[]>([]);
  const [constructorStandings, setConstructorStandings] = useState<ApiConstructorStanding[]>([]);
  const [raceResults, setRaceResults] = useState<RaceResultEntry[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(true);
  const [progression, setProgression] = useState<{
    raceNames: string[];
    drivers: { position: number; code: string; name: string; team: string; teamColor: string; points: number; pointsHistory: number[] }[];
  }>({ raceNames: [], drivers: [] });

  // Fetch race calendar
  useEffect(() => {
    setLoading(true);
    setSelectedRound("latest");
    Promise.all([
      fetch(`/api/f1/sessions?year=${year}&type=Race`).then((r) => r.json()),
      fetch(`/api/f1/meetings?year=${year}`).then((r) => r.json()),
    ])
      .then(([sess, meets]) => {
        setSessions(Array.isArray(sess) ? sess : []);
        setMeetings(Array.isArray(meets) ? meets : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  // Fetch standings + results + progression
  useEffect(() => {
    setStandingsLoading(true);
    Promise.all([
      fetch(`/api/f1/standings/drivers?year=${year}`).then((r) => r.json()),
      fetch(`/api/f1/standings/constructors?year=${year}`).then((r) => r.json()),
      fetch(`/api/f1/results?year=${year}`).then((r) => r.json()),
      fetch(`/api/f1/standings/progression?year=${year}`).then((r) => r.json()),
    ])
      .then(([drivers, constructors, results, prog]) => {
        setDriverStandings(Array.isArray(drivers) ? drivers : []);
        setConstructorStandings(Array.isArray(constructors) ? constructors : []);
        setRaceResults(Array.isArray(results) ? results : []);
        setProgression(prog?.raceNames ? prog : { raceNames: [], drivers: [] });
        if (Array.isArray(drivers) && drivers.length > 0) {
          setSelectedDriver(drivers[0].driver.code);
        }
      })
      .catch(console.error)
      .finally(() => setStandingsLoading(false));
  }, [year]);

  // Live polling
  const isLiveSession = useIsRaceWeekend(sessions);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLiveSession) {
      pollingRef.current = setInterval(() => {
        Promise.all([
          fetch(`/api/f1/standings/drivers?year=${year}`).then((r) => r.json()),
          fetch(`/api/f1/standings/constructors?year=${year}`).then((r) => r.json()),
        ]).then(([drivers, constructors]) => {
          if (Array.isArray(drivers)) setDriverStandings(drivers);
          if (Array.isArray(constructors)) setConstructorStandings(constructors);
        }).catch(console.error);
      }, 10000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isLiveSession, year]);

  // ── Derived data ──

  const getMeetingName = (meetingKey: number) =>
    meetings.find((m) => m.meeting_key === meetingKey)?.meeting_name || "";

  const now = new Date();
  const pastRaces = sessions.filter((s) => new Date(s.date_start) < now);
  const upcomingRaces = sessions.filter((s) => new Date(s.date_start) >= now);
  const nextRace = upcomingRaces[0];

  // Build race options for the dropdown
  const raceOptions = useMemo(() => {
    if (!raceResults.length) return [];
    return raceResults.map((r) => ({
      round: r.round,
      label: `R${String(r.round).padStart(2, "0")} — ${r.raceName.replace(" Grand Prix", " GP")}`,
      country: r.country,
      circuit: r.circuit,
    }));
  }, [raceResults]);

  // The displayed race result — either the selected round or latest
  const displayedResult = useMemo(() => {
    if (!raceResults.length) return null;
    if (selectedRound === "latest") {
      return raceResults[raceResults.length - 1];
    }
    return raceResults.find((r) => r.round === selectedRound) || null;
  }, [raceResults, selectedRound]);

  // Map the displayed race to a session for the circuit map
  const displayedSession = useMemo(() => {
    if (!displayedResult || !sessions.length) return null;
    // Try to match by country/circuit
    return sessions.find((s) =>
      s.country_name?.toLowerCase().includes(displayedResult.country?.toLowerCase() || "") ||
      s.circuit_short_name?.toLowerCase().includes(displayedResult.circuit?.toLowerCase().split(" ")[0] || "")
    ) || sessions[sessions.length - 1];
  }, [displayedResult, sessions]);

  const leader = driverStandings[0];
  const secondPlace = driverStandings[1];
  const pointsGap = leader && secondPlace ? leader.points - secondPlace.points : 0;

  // Championship chart data
  const buildDriverChampData = (): { standings: DriverStanding[]; raceNames: string[] } => {
    if (!progression.drivers || progression.drivers.length === 0) {
      return { standings: [], raceNames: [] };
    }
    const raceNames = progression.raceNames.map((n: string) => n.replace(" Grand Prix", " GP"));
    const standings: DriverStanding[] = progression.drivers.map((d) => ({
      position: d.position,
      driver: {
        number: 0,
        code: d.code,
        name: d.name,
        team: d.team,
        teamColor: d.teamColor || getTeamColor(d.team),
        nationality: "",
      },
      points: d.points,
      wins: 0,
      podiums: 0,
      pointsHistory: d.pointsHistory || [d.points],
    }));
    return { standings, raceNames };
  };

  const buildConstructorData = (): ConstructorStanding[] => {
    return constructorStandings.map((c) => ({
      position: c.position,
      team: c.team,
      teamColor: c.teamColor || getTeamColor(c.team),
      points: c.points,
      wins: c.wins,
      drivers: [],
      pointsHistory: [c.points],
    }));
  };

  const { standings: champStandings, raceNames: champRaceNames } = buildDriverChampData();
  const constructorChartData = buildConstructorData();

  // Session key for the circuit map
  const heroSessionKey = displayedSession?.session_key || null;
  const heroCircuitName = displayedSession
    ? `${getMeetingName(displayedSession.meeting_key).replace(" Grand Prix", " GP") || displayedSession.circuit_short_name}`
    : "";

  return (
    <div className="animate-fade-in -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">

      {/* ════════════════════════════════════════════════════════════════════
          HERO SECTION — Full-width race weekend command center
          ════════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden px-2 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-6 sm:pb-8">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-f1-red/[0.03] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-f1-red/[0.02] rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-[1600px] mx-auto">
          {/* Top bar: year + race selectors + live indicator */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Year selector */}
              <div className="relative">
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="appearance-none bg-[var(--f1-hover)] border border-[var(--f1-border)] rounded-lg pl-3 pr-8 py-1.5 text-sm font-mono text-f1-sub cursor-pointer hover:border-f1-red/30 transition-colors outline-none"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y} className="bg-[var(--f1-card)]">
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
              </div>

              <span className="text-[var(--f1-text-dim)] text-xs">/</span>

              {/* Race/Circuit selector */}
              <div className="relative">
                <select
                  value={selectedRound === "latest" ? "latest" : selectedRound}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedRound(val === "latest" ? "latest" : Number(val));
                  }}
                  className="appearance-none bg-[var(--f1-hover)] border border-[var(--f1-border)] rounded-lg pl-3 pr-8 py-1.5 text-sm font-mono text-f1-sub cursor-pointer hover:border-f1-red/30 transition-colors outline-none max-w-[200px] sm:max-w-[280px]"
                >
                  <option value="latest" className="bg-[var(--f1-card)]">
                    Latest Race
                  </option>
                  {raceOptions.map((r) => (
                    <option key={r.round} value={r.round} className="bg-[var(--f1-card)]">
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
              </div>

              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--f1-text-dim)]">
                Season
              </span>
            </div>

            <div
              className={cn(
                "flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border",
                isLiveSession
                  ? "text-racing-green border-racing-green/20 bg-racing-green/5"
                  : "text-f1-muted border-[var(--f1-border)] bg-[var(--f1-hover)]"
              )}
            >
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isLiveSession
                    ? "bg-racing-green animate-pulse shadow-[0_0_8px_rgba(0,210,190,0.6)]"
                    : "bg-[var(--f1-text-dim)]"
                )}
              />
              {isLiveSession ? "LIVE SESSION" : "NO LIVE SESSION"}
            </div>
          </div>

          {/* Hero layout: text left, circuit map right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left: editorial text */}
            <div>
              {/* Tiny label */}
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-f1-red/70 mb-3">
                {displayedResult
                  ? `Round ${displayedResult.round} Result`
                  : nextRace
                  ? "Coming Up"
                  : `${year} Season`}
              </div>

              {/* Huge race name */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-display font-black uppercase tracking-tight leading-[0.95]">
                {displayedResult ? (
                  <>
                    <span className="text-f1">
                      {displayedResult.raceName.replace(" Grand Prix", "")}
                    </span>
                    <br />
                    <span className="text-f1-red glow-text">GP</span>
                  </>
                ) : nextRace ? (
                  <>
                    <span className="text-f1">
                      {(getMeetingName(nextRace.meeting_key) || nextRace.circuit_short_name)
                        .replace(" Grand Prix", "")}
                    </span>
                    <br />
                    <span className="text-f1-red glow-text">GP</span>
                  </>
                ) : (
                  <>
                    <span className="text-f1">F1 Pulse</span>
                    <br />
                    <span className="text-f1-red glow-text">{year}</span>
                  </>
                )}
              </h1>

              {/* Subtext */}
              <div className="mt-4 flex items-center gap-4 text-sm text-f1-muted">
                {displayedResult && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {displayedResult.circuit}, {displayedResult.country}
                    </span>
                    <span className="text-[var(--f1-text-dim)]">|</span>
                    <span className="font-mono text-xs">
                      {new Date(displayedResult.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </>
                )}
                {!displayedResult && (
                  <span className="font-mono text-xs">
                    Round {pastRaces.length}/{sessions.length || "—"}
                  </span>
                )}
              </div>

              {/* Winner callout */}
              {displayedResult && displayedResult.results[0] && (
                <div className="mt-8">
                  <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--f1-text-dim)] mb-2">
                    Race Winner
                  </div>
                  <div className="flex items-end gap-4">
                    {(() => {
                      const winnerTeam = displayedResult.results[0].driver.team;
                      const winnerLogo = getTeamLogoUrl(winnerTeam);
                      const winnerColor = displayedResult.results[0].driver.teamColor || getTeamColor(winnerTeam);
                      return winnerLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={winnerLogo} alt={winnerTeam} className="w-10 h-10 object-contain flex-shrink-0" loading="lazy" />
                      ) : (
                        <div className="w-1 h-12 rounded-full" style={{ backgroundColor: winnerColor }} />
                      );
                    })()}
                    <div>
                      <div className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight">
                        {displayedResult.results[0].driver.name}
                      </div>
                      <div
                        className="text-xs font-semibold uppercase tracking-wider mt-0.5"
                        style={{
                          color:
                            displayedResult.results[0].driver.teamColor ||
                            getTeamColor(displayedResult.results[0].driver.team),
                        }}
                      >
                        {displayedResult.results[0].driver.team}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick stat pills */}
              <div className="mt-8 flex flex-wrap gap-2">
                {leader && (
                  <div className="flex items-center gap-2 bg-[var(--f1-hover)] border border-[var(--f1-border)] rounded-lg px-3 py-2">
                    <Trophy className="w-3.5 h-3.5 text-racing-amber" />
                    <span className="text-xs font-semibold">
                      {leader.driver.code}
                    </span>
                    <span className="text-xs font-mono text-f1-muted">
                      {leader.points} pts
                    </span>
                    {pointsGap > 0 && (
                      <span className="text-[10px] font-mono text-racing-green">
                        +{pointsGap}
                      </span>
                    )}
                  </div>
                )}
                {nextRace && (
                  <Link
                    href="/race"
                    className="flex items-center gap-2 bg-[var(--f1-hover)] border border-[var(--f1-border)] rounded-lg px-3 py-2 hover:border-f1-red/20 transition-colors group"
                  >
                    <Calendar className="w-3.5 h-3.5 text-f1-red/60" />
                    <span className="text-xs font-semibold">
                      Next:{" "}
                      {(
                        getMeetingName(nextRace.meeting_key) ||
                        nextRace.circuit_short_name
                      )
                        .replace(" Grand Prix", " GP")}
                    </span>
                    <span className="text-[10px] font-mono text-f1-muted">
                      {new Date(nextRace.date_start).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <ArrowRight className="w-3 h-3 text-[var(--f1-text-dim)] group-hover:text-f1-red transition-colors" />
                  </Link>
                )}
              </div>
            </div>

            {/* Right: Circuit Map */}
            <div className="relative">
              <CircuitMap
                sessionKey={heroSessionKey}
                compact
                circuitName={heroCircuitName}
                height="h-[320px] sm:h-[380px]"
                showLabels={false}
              />
              {/* Fade overlay at edges */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-transparent via-transparent to-[var(--f1-black)] opacity-20" />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PODIUM — Selected race results with editorial hierarchy
          ════════════════════════════════════════════════════════════════════ */}
      {displayedResult && displayedResult.results.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Flag className="w-4 h-4 text-f1-red/60" />
                <h2 className="text-f1-sm uppercase tracking-wider text-f1-muted">
                  Race Result — {displayedResult.raceName.replace(" Grand Prix", " GP")}
                </h2>
              </div>
              <span className="text-[10px] font-mono text-[var(--f1-text-dim)]">
                {displayedResult.results.length} classified
              </span>
            </div>

            {/* Podium cards — P1 gets hero treatment */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {displayedResult.results.slice(0, 3).map((r) => (
                <PodiumCard
                  key={r.driver.code}
                  position={r.position}
                  driver={r.driver}
                  time={r.time}
                  gridPos={r.grid}
                />
              ))}
            </div>

            {/* P4-P10 compact strip */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {displayedResult.results.slice(3, 10).map((r) => {
                const color = r.driver.teamColor || getTeamColor(r.driver.team);
                const gainedPositions = r.grid - r.position;
                return (
                  <div
                    key={r.driver.code}
                    className="flex items-center gap-2 py-2 px-3 rounded-lg bg-[var(--f1-hover)] border border-[var(--f1-border)]"
                  >
                    <span className="text-xs font-display font-black text-[var(--f1-text-dim)] w-5">
                      {r.position}
                    </span>
                    <div
                      className="w-[2px] h-4 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-bold flex-1">{r.driver.code}</span>
                    {r.points > 0 && (
                      <span className="text-[10px] font-mono text-racing-amber/50">
                        +{r.points}
                      </span>
                    )}
                    {gainedPositions > 2 && (
                      <span className="text-[9px] font-mono text-racing-green">
                        +{gainedPositions}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Full classification P11-P20 (collapsible) */}
            {displayedResult.results.length > 10 && (
              <details className="mt-3">
                <summary className="text-[10px] font-mono uppercase tracking-widest text-[var(--f1-text-dim)] cursor-pointer hover:text-f1-muted transition-colors py-2">
                  Show full classification ({displayedResult.results.length - 10} more)
                </summary>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 mt-2">
                  {displayedResult.results.slice(10).map((r) => {
                    const color = r.driver.teamColor || getTeamColor(r.driver.team);
                    return (
                      <div
                        key={r.driver.code}
                        className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-[var(--f1-hover)] border border-[var(--f1-border)] opacity-70"
                      >
                        <span className="text-[11px] font-display font-black text-[var(--f1-text-dim)] w-5">
                          {r.position}
                        </span>
                        <div className="w-[2px] h-3.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[11px] font-bold flex-1">{r.driver.code}</span>
                        <span className="text-[9px] font-mono text-[var(--f1-text-dim)]">
                          {r.status !== "Finished" && r.status !== "+1 Lap" ? r.status.substring(0, 3).toUpperCase() : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          CHAMPIONSHIP — Chart + Standings
          ════════════════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-[1600px] mx-auto">
          {/* Section header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-f1-red/60" />
              <h2 className="text-f1-sm uppercase tracking-wider text-f1-muted">
                Championship
              </h2>
            </div>

            {/* Tab toggle */}
            <div className="flex items-center gap-0.5 bg-[var(--f1-hover)] border border-[var(--f1-border)] p-0.5 rounded-lg">
              {(["drivers", "constructors"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all",
                    activeTab === tab
                      ? "bg-f1-red/15 text-f1-red"
                      : "text-f1-muted hover:text-f1-sub"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Championship leader callout */}
          {leader && activeTab === "drivers" && (
            <div className="mb-6 flex items-end gap-6">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--f1-text-dim)] mb-1">
                  Championship Leader
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const leaderLogo = getTeamLogoUrl(leader.driver.team);
                    const leaderColor = leader.driver.teamColor || getTeamColor(leader.driver.team);
                    return leaderLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={leaderLogo} alt={leader.driver.team} className="w-8 h-8 object-contain flex-shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-1 h-10 rounded-full" style={{ backgroundColor: leaderColor }} />
                    );
                  })()}
                  <div>
                    <span className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight">
                      {leader.driver.name.split(" ").pop()}
                    </span>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{
                          color: leader.driver.teamColor || getTeamColor(leader.driver.team),
                        }}
                      >
                        {leader.driver.team}
                      </span>
                      <span className="font-mono text-sm font-bold text-racing-amber">
                        {leader.points} PTS
                      </span>
                      {pointsGap > 0 && (
                        <span className="text-[10px] font-mono text-[var(--f1-text-dim)]">
                          +{pointsGap} to P2
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Grid: chart left, standings right */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Chart */}
            <div className="xl:col-span-2 glass-card p-5">
              {standingsLoading ? (
                <div className="flex items-center justify-center h-[400px]">
                  <Loader2 className="w-5 h-5 text-f1-red animate-spin" />
                </div>
              ) : activeTab === "drivers" ? (
                champStandings.length > 0 ? (
                  <ChampionshipChart drivers={champStandings} races={champRaceNames} />
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-f1-muted text-sm font-mono">
                    No championship data for {year}
                  </div>
                )
              ) : constructorChartData.length > 0 ? (
                <ConstructorBarChart constructors={constructorChartData} />
              ) : (
                <div className="flex items-center justify-center h-[300px] text-f1-muted text-sm font-mono">
                  No constructor data for {year}
                </div>
              )}
            </div>

            {/* Standings list */}
            <div className="glass-card p-4">
              <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--f1-text-dim)] mb-3 px-3">
                {activeTab === "drivers" ? "Driver Standings" : "Constructor Standings"}
              </div>
              {standingsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-f1-red animate-spin" />
                </div>
              ) : (
                <div className="space-y-0.5 max-h-[420px] overflow-y-auto fade-bottom">
                  {activeTab === "drivers"
                    ? driverStandings.map((d) => (
                        <StandingRow
                          key={d.driver.code}
                          position={d.position}
                          name={d.driver.name}
                          team={d.driver.team}
                          points={d.points}
                          wins={d.wins}
                          teamColor={d.driver.teamColor || getTeamColor(d.driver.team)}
                          isSelected={selectedDriver === d.driver.code}
                          onClick={() => setSelectedDriver(d.driver.code)}
                        />
                      ))
                    : constructorStandings.map((c) => (
                        <StandingRow
                          key={c.team}
                          position={c.position}
                          name={c.team}
                          team={c.team}
                          points={c.points}
                          wins={c.wins}
                          teamColor={c.teamColor || getTeamColor(c.team)}
                        />
                      ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          PREDICTIONS
          ════════════════════════════════════════════════════════════════════ */}
      {nextRace && (
        <section className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-[1600px] mx-auto">
            <PredictionPanel
              year={year}
              nextRaceCircuit={nextRace?.circuit_short_name}
              nextRaceName={
                getMeetingName(nextRace?.meeting_key) || nextRace?.circuit_short_name
              }
            />
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          RACE CALENDAR — Timeline style
          ════════════════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-8 py-6 pb-12">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-f1-red/60" />
              <h2 className="text-f1-sm uppercase tracking-wider text-f1-muted">
                {year} Calendar
              </h2>
            </div>
            <span className="text-[10px] font-mono text-[var(--f1-text-dim)]">
              {pastRaces.length} of {sessions.length} completed
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-f1-red animate-spin" />
            </div>
          ) : (
            <>
              {/* Calendar timeline */}
              <div className="relative">
                {/* Progress bar background */}
                <div className="absolute top-4 left-0 right-0 h-[2px] bg-black/[0.04] dark:bg-white/[0.04] rounded-full" />
                {/* Progress bar fill */}
                {sessions.length > 0 && (
                  <div
                    className="absolute top-4 left-0 h-[2px] bg-f1-red/40 rounded-full transition-all duration-1000"
                    style={{
                      width: `${(pastRaces.length / sessions.length) * 100}%`,
                    }}
                  />
                )}

                {/* Race dots */}
                <div className="flex overflow-x-auto pb-4 gap-0 snap-x snap-mandatory scrollbar-thin">
                  {sessions.map((race, idx) => {
                    const isPast = new Date(race.date_start) < now;
                    const isNext = nextRace?.session_key === race.session_key;
                    const name = getMeetingName(race.meeting_key) || race.circuit_short_name;

                    return (
                      <button
                        key={race.session_key}
                        onClick={() => {
                          // Find the matching round from results
                          const matchingResult = raceResults.find(
                            (r) =>
                              r.country?.toLowerCase() === race.country_name?.toLowerCase() ||
                              r.circuit?.toLowerCase().includes(race.circuit_short_name?.toLowerCase())
                          );
                          if (matchingResult) {
                            setSelectedRound(matchingResult.round);
                          }
                        }}
                        className={cn(
                          "flex-shrink-0 snap-start flex flex-col items-center group transition-all duration-300 cursor-pointer",
                          isNext ? "w-[120px]" : "w-[60px] sm:w-[70px]",
                          !isPast && !isNext && "opacity-40"
                        )}
                      >
                        {/* Dot on the timeline */}
                        <div
                          className={cn(
                            "relative rounded-full transition-all duration-300",
                            isNext
                              ? "w-3 h-3 bg-f1-red shadow-[0_0_12px_rgba(225,6,0,0.5)]"
                              : isPast
                              ? "w-2 h-2 bg-f1-muted group-hover:bg-f1-red/60"
                              : "w-1.5 h-1.5 bg-[var(--f1-text-dim)] group-hover:bg-f1-muted"
                          )}
                        />

                        {/* Label */}
                        <div
                          className={cn(
                            "mt-3 text-center transition-all",
                            isNext ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <div className="text-[9px] font-mono text-[var(--f1-text-dim)]">
                            R{String(idx + 1).padStart(2, "0")}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] font-semibold truncate max-w-[100px]",
                              isNext ? "text-f1" : "text-f1-sub"
                            )}
                          >
                            {name.replace(" Grand Prix", " GP")}
                          </div>
                          <div className="text-[9px] font-mono text-[var(--f1-text-dim)] mt-0.5">
                            {new Date(race.date_start).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        </div>

                        {/* "NEXT" badge */}
                        {isNext && (
                          <div className="mt-2 text-[8px] font-mono font-bold uppercase tracking-wider text-f1-red bg-f1-red/10 px-2 py-0.5 rounded-full">
                            Next
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Expanded calendar grid below — next + recent races */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {sessions
                  .filter((_, i) => {
                    // Show: last 2 past + next race + 2 upcoming
                    const nextIdx = sessions.findIndex(
                      (s) => s.session_key === nextRace?.session_key
                    );
                    if (nextIdx === -1) return i >= sessions.length - 5;
                    return i >= Math.max(0, nextIdx - 2) && i <= nextIdx + 2;
                  })
                  .map((race) => {
                    const isPast = new Date(race.date_start) < now;
                    const isNext = nextRace?.session_key === race.session_key;
                    const name = getMeetingName(race.meeting_key) || race.circuit_short_name;
                    const globalIdx = sessions.findIndex(
                      (s) => s.session_key === race.session_key
                    );

                    return (
                      <button
                        key={race.session_key}
                        onClick={() => {
                          const matchingResult = raceResults.find(
                            (r) =>
                              r.country?.toLowerCase() === race.country_name?.toLowerCase() ||
                              r.circuit?.toLowerCase().includes(race.circuit_short_name?.toLowerCase())
                          );
                          if (matchingResult) {
                            setSelectedRound(matchingResult.round);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        }}
                        className={cn(
                          "p-3 rounded-xl border transition-all duration-300 group text-left cursor-pointer",
                          isNext
                            ? "border-f1-red/20 bg-f1-red/[0.04]"
                            : isPast
                            ? "border-[var(--f1-border)] bg-[var(--f1-hover)] hover:border-f1-muted/30"
                            : "border-[var(--f1-border)] bg-[var(--f1-hover)] opacity-60 hover:opacity-80"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-[var(--f1-text-dim)]">
                            R{String(globalIdx + 1).padStart(2, "0")}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isPast && (
                              <div className="w-1.5 h-1.5 rounded-full bg-racing-green/60" />
                            )}
                            {isNext && (
                              <div className="text-[8px] font-mono font-bold text-f1-red uppercase tracking-wider">
                                Next
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-sm font-semibold truncate group-hover:text-f1 transition-colors">
                          {name.replace(" Grand Prix", " GP")}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <MapPin className="w-3 h-3 text-[var(--f1-text-dim)]" />
                          <span className="text-[10px] text-[var(--f1-text-dim)] truncate">
                            {race.circuit_short_name}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--f1-text-dim)] mt-1">
                          {new Date(race.date_start).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
