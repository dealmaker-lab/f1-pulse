"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Trophy, Flag, Timer, TrendingUp, ChevronRight,
  Calendar, MapPin, Loader2, ArrowRight, Zap, ChevronDown,
} from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";
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
          : ""
      )}
      style={{
        background: isWinner
          ? `linear-gradient(135deg, ${color}15, ${color}05)`
          : "rgba(255,255,255,0.02)",
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
            style={{ color: position === 1 ? "#ffc906" : position === 2 ? "rgba(255,255,255,0.6)" : "#cd7f32" }}
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
          <div className="mt-3 text-xs font-mono text-white/30">
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
          ? "bg-white/[0.06]"
          : "hover:bg-white/[0.03]"
      )}
    >
      {/* Position */}
      <span
        className={cn(
          "w-6 text-right font-display font-black text-sm flex-shrink-0",
          position === 1 && "text-[#ffc906]",
          position === 2 && "text-white/60",
          position === 3 && "text-[#cd7f32]",
          position > 3 && "text-white/20"
        )}
      >
        {position}
      </span>

      {/* Team color bar */}
      <div
        className="w-[3px] h-5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Name + team */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate group-hover:text-white transition-colors">
          {name}
        </div>
        <div className="text-[10px] text-white/25 truncate">{team}</div>
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
  const [year, setYear] = useState(2026);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [meetings, setMeetings] = useState<MeetingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState("RUS");
  const [activeTab, setActiveTab] = useState<"drivers" | "constructors">("drivers");

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
  const latestRace = pastRaces[pastRaces.length - 1];
  const nextRace = upcomingRaces[0];
  const latestResult = raceResults.length > 0 ? raceResults[raceResults.length - 1] : null;
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
  const heroSessionKey = latestRace?.session_key || null;
  const heroCircuitName = latestRace
    ? `${getMeetingName(latestRace.meeting_key).replace(" Grand Prix", " GP") || latestRace.circuit_short_name}`
    : "";

  return (
    <div className="animate-fade-in -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">

      {/* ════════════════════════════════════════════════════════════════════
          HERO SECTION — Full-width race weekend command center
          ════════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden px-4 sm:px-6 lg:px-8 pt-6 pb-8">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-f1-red/[0.03] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-f1-red/[0.02] rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-[1600px] mx-auto">
          {/* Top bar: year selector + live indicator */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="appearance-none bg-white/[0.04] border border-white/[0.08] rounded-lg pl-3 pr-8 py-1.5 text-sm font-mono text-white/70 cursor-pointer hover:border-white/15 transition-colors outline-none"
                >
                  {[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
                    <option key={y} value={y} className="bg-[#15151e]">
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              </div>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/20">
                Season
              </span>
            </div>

            <div
              className={cn(
                "flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border",
                isLiveSession
                  ? "text-racing-green border-racing-green/20 bg-racing-green/5"
                  : "text-white/30 border-white/[0.06] bg-white/[0.02]"
              )}
            >
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isLiveSession
                    ? "bg-racing-green animate-pulse shadow-[0_0_8px_rgba(0,210,190,0.6)]"
                    : "bg-white/20"
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
                {latestResult ? "Latest Result" : nextRace ? "Coming Up" : `${year} Season`}
              </div>

              {/* Huge race name */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-black uppercase tracking-tight leading-[0.95]">
                {latestResult ? (
                  <>
                    <span className="text-white">
                      {latestResult.raceName.replace(" Grand Prix", "")}
                    </span>
                    <br />
                    <span className="text-f1-red glow-text">GP</span>
                  </>
                ) : nextRace ? (
                  <>
                    <span className="text-white">
                      {(getMeetingName(nextRace.meeting_key) || nextRace.circuit_short_name)
                        .replace(" Grand Prix", "")}
                    </span>
                    <br />
                    <span className="text-f1-red glow-text">GP</span>
                  </>
                ) : (
                  <>
                    <span className="text-white">F1 Pulse</span>
                    <br />
                    <span className="text-f1-red glow-text">{year}</span>
                  </>
                )}
              </h1>

              {/* Subtext */}
              <div className="mt-4 flex items-center gap-4 text-sm text-white/30">
                {latestRace && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {latestRace.circuit_short_name}, {latestRace.country_name}
                    </span>
                    <span className="text-white/10">|</span>
                  </>
                )}
                <span className="font-mono text-xs">
                  Round {pastRaces.length}/{sessions.length || "—"}
                </span>
              </div>

              {/* Winner callout */}
              {latestResult && latestResult.results[0] && (
                <div className="mt-8">
                  <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/20 mb-2">
                    Race Winner
                  </div>
                  <div className="flex items-end gap-4">
                    <div
                      className="w-1 h-12 rounded-full"
                      style={{
                        backgroundColor:
                          latestResult.results[0].driver.teamColor ||
                          getTeamColor(latestResult.results[0].driver.team),
                      }}
                    />
                    <div>
                      <div className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight">
                        {latestResult.results[0].driver.name}
                      </div>
                      <div
                        className="text-xs font-semibold uppercase tracking-wider mt-0.5"
                        style={{
                          color:
                            latestResult.results[0].driver.teamColor ||
                            getTeamColor(latestResult.results[0].driver.team),
                        }}
                      >
                        {latestResult.results[0].driver.team}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick stat pills */}
              <div className="mt-8 flex flex-wrap gap-2">
                {leader && (
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                    <Trophy className="w-3.5 h-3.5 text-racing-amber" />
                    <span className="text-xs font-semibold">
                      {leader.driver.code}
                    </span>
                    <span className="text-xs font-mono text-white/40">
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
                    className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 hover:border-f1-red/20 transition-colors group"
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
                    <span className="text-[10px] font-mono text-white/30">
                      {new Date(nextRace.date_start).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <ArrowRight className="w-3 h-3 text-white/20 group-hover:text-f1-red transition-colors" />
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
          PODIUM — Latest race results with editorial hierarchy
          ════════════════════════════════════════════════════════════════════ */}
      {latestResult && latestResult.results.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Flag className="w-4 h-4 text-f1-red/60" />
                <h2 className="text-f1-sm uppercase tracking-wider text-white/40">
                  Race Result
                </h2>
              </div>
              <Link
                href="/race"
                className="text-[10px] font-mono uppercase tracking-widest text-white/20 hover:text-f1-red transition-colors flex items-center gap-1"
              >
                Full Results <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Podium cards — P1 gets hero treatment */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {latestResult.results.slice(0, 3).map((r) => (
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
              {latestResult.results.slice(3, 10).map((r) => {
                const color = r.driver.teamColor || getTeamColor(r.driver.team);
                const gainedPositions = r.grid - r.position;
                return (
                  <div
                    key={r.driver.code}
                    className="flex items-center gap-2 py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                  >
                    <span className="text-xs font-display font-black text-white/25 w-5">
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
              <h2 className="text-f1-sm uppercase tracking-wider text-white/40">
                Championship
              </h2>
            </div>

            {/* Tab toggle */}
            <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] p-0.5 rounded-lg">
              {(["drivers", "constructors"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all",
                    activeTab === tab
                      ? "bg-f1-red/15 text-f1-red"
                      : "text-white/30 hover:text-white/50"
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
                <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/15 mb-1">
                  Championship Leader
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="w-1 h-10 rounded-full"
                    style={{
                      backgroundColor: leader.driver.teamColor || getTeamColor(leader.driver.team),
                    }}
                  />
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
                        <span className="text-[10px] font-mono text-white/20">
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
                  <div className="flex items-center justify-center h-[400px] text-white/20 text-sm font-mono">
                    No championship data for {year}
                  </div>
                )
              ) : constructorChartData.length > 0 ? (
                <ConstructorBarChart constructors={constructorChartData} />
              ) : (
                <div className="flex items-center justify-center h-[300px] text-white/20 text-sm font-mono">
                  No constructor data for {year}
                </div>
              )}
            </div>

            {/* Standings list */}
            <div className="glass-card p-4">
              <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/20 mb-3 px-3">
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
              <h2 className="text-f1-sm uppercase tracking-wider text-white/40">
                {year} Calendar
              </h2>
            </div>
            <span className="text-[10px] font-mono text-white/15">
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
                <div className="absolute top-4 left-0 right-0 h-[2px] bg-white/[0.04] rounded-full" />
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
                      <Link
                        key={race.session_key}
                        href="/race"
                        className={cn(
                          "flex-shrink-0 snap-start flex flex-col items-center group transition-all duration-300",
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
                              ? "w-2 h-2 bg-white/30 group-hover:bg-f1-red/60"
                              : "w-1.5 h-1.5 bg-white/10 group-hover:bg-white/20"
                          )}
                        />

                        {/* Label */}
                        <div
                          className={cn(
                            "mt-3 text-center transition-all",
                            isNext ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <div className="text-[9px] font-mono text-white/20">
                            R{String(idx + 1).padStart(2, "0")}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] font-semibold truncate max-w-[100px]",
                              isNext ? "text-white" : "text-white/50"
                            )}
                          >
                            {name.replace(" Grand Prix", " GP")}
                          </div>
                          <div className="text-[9px] font-mono text-white/15 mt-0.5">
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
                      </Link>
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
                  .map((race, idx) => {
                    const isPast = new Date(race.date_start) < now;
                    const isNext = nextRace?.session_key === race.session_key;
                    const name = getMeetingName(race.meeting_key) || race.circuit_short_name;
                    const globalIdx = sessions.findIndex(
                      (s) => s.session_key === race.session_key
                    );

                    return (
                      <Link
                        key={race.session_key}
                        href="/race"
                        className={cn(
                          "p-3 rounded-xl border transition-all duration-300 group",
                          isNext
                            ? "border-f1-red/20 bg-f1-red/[0.04]"
                            : isPast
                            ? "border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08]"
                            : "border-white/[0.03] bg-white/[0.01] opacity-60 hover:opacity-80"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-white/20">
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
                        <div className="text-sm font-semibold truncate group-hover:text-white transition-colors">
                          {name.replace(" Grand Prix", " GP")}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <MapPin className="w-3 h-3 text-white/15" />
                          <span className="text-[10px] text-white/25 truncate">
                            {race.circuit_short_name}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-white/15 mt-1">
                          {new Date(race.date_start).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </Link>
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
