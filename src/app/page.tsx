"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Trophy, Flag, Timer, Gauge, TrendingUp, ChevronRight, Calendar, MapPin, Zap, Loader2, Brain, RefreshCw } from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";
import { useIsRaceWeekend } from "@/hooks/use-live-polling";
import ChampionshipChart from "@/components/charts/championship-chart";
import ConstructorBarChart from "@/components/charts/constructor-bar-chart";
import StrategyChart from "@/components/charts/strategy-chart";
import LapTimesChart from "@/components/charts/lap-times-chart";
import { DriverStanding, ConstructorStanding } from "@/types/f1";
import { mockStrategyData, generateMockLapTimes } from "@/data/mock-data";
import PredictionPanel from "@/components/predictions/prediction-panel";
import Link from "next/link";

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

export default function DashboardPage() {
  const [year, setYear] = useState(2026);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [meetings, setMeetings] = useState<MeetingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState("RUS");
  const [activeTab, setActiveTab] = useState<"drivers" | "constructors">("drivers");

  // Real data states
  const [driverStandings, setDriverStandings] = useState<ApiDriverStanding[]>([]);
  const [constructorStandings, setConstructorStandings] = useState<ApiConstructorStanding[]>([]);
  const [raceResults, setRaceResults] = useState<RaceResultEntry[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(true);
  const [progression, setProgression] = useState<{ raceNames: string[]; drivers: any[] }>({ raceNames: [], drivers: [] });

  // Fetch real race calendar
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/f1/sessions?year=${year}&type=Race`).then((r) => r.json()),
      fetch(`/api/f1/meetings?year=${year}`).then((r) => r.json()),
    ]).then(([sess, meets]) => {
      setSessions(Array.isArray(sess) ? sess : []);
      setMeetings(Array.isArray(meets) ? meets : []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  // Fetch real standings + results + progression from Jolpica API
  useEffect(() => {
    setStandingsLoading(true);
    Promise.all([
      fetch(`/api/f1/standings/drivers?year=${year}`).then((r) => r.json()),
      fetch(`/api/f1/standings/constructors?year=${year}`).then((r) => r.json()),
      fetch(`/api/f1/results?year=${year}`).then((r) => r.json()),
      fetch(`/api/f1/standings/progression?year=${year}`).then((r) => r.json()),
    ]).then(([drivers, constructors, results, prog]) => {
      setDriverStandings(Array.isArray(drivers) ? drivers : []);
      setConstructorStandings(Array.isArray(constructors) ? constructors : []);
      setRaceResults(Array.isArray(results) ? results : []);
      setProgression(prog?.raceNames ? prog : { raceNames: [], drivers: [] });
      // Auto-select the championship leader
      if (Array.isArray(drivers) && drivers.length > 0) {
        setSelectedDriver(drivers[0].driver.code);
      }
    }).catch(console.error)
      .finally(() => setStandingsLoading(false));
  }, [year]);

  // Live polling during active sessions
  const isLiveSession = useIsRaceWeekend(sessions);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLiveSession) {
      pollingRef.current = setInterval(() => {
        // Re-fetch standings + results during live sessions
        Promise.all([
          fetch(`/api/f1/standings/drivers?year=${year}`).then((r) => r.json()),
          fetch(`/api/f1/standings/constructors?year=${year}`).then((r) => r.json()),
        ]).then(([drivers, constructors]) => {
          if (Array.isArray(drivers)) setDriverStandings(drivers);
          if (Array.isArray(constructors)) setConstructorStandings(constructors);
        }).catch(console.error);
      }, 10000); // Poll every 10 seconds
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isLiveSession, year]);

  const getMeetingName = (meetingKey: number) =>
    meetings.find((m) => m.meeting_key === meetingKey)?.meeting_name || "";

  // Split into past and upcoming
  const now = new Date();
  const pastRaces = sessions.filter((s) => new Date(s.date_start) < now);
  const upcomingRaces = sessions.filter((s) => new Date(s.date_start) >= now);
  const latestRace = pastRaces[pastRaces.length - 1];
  const nextRace = upcomingRaces[0];

  // Build championship progression from the progression API endpoint
  const buildDriverChampData = (): { standings: DriverStanding[]; raceNames: string[] } => {
    if (!progression.drivers || progression.drivers.length === 0) {
      return { standings: [], raceNames: [] };
    }

    const raceNames = progression.raceNames.map((n: string) => n.replace(" Grand Prix", " GP"));

    const standings: DriverStanding[] = progression.drivers.map((d: any) => ({
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

  // Build constructor chart data
  const buildConstructorData = (): ConstructorStanding[] => {
    return constructorStandings.map((c) => ({
      position: c.position,
      team: c.team,
      teamColor: c.teamColor || getTeamColor(c.team),
      points: c.points,
      wins: c.wins,
      drivers: [], // not needed for bar chart
      pointsHistory: [c.points],
    }));
  };

  const { standings: champStandings, raceNames: champRaceNames } = buildDriverChampData();
  const constructorChartData = buildConstructorData();

  // Get selected driver data for lap times
  const selectedDriverData = driverStandings.find((d) => d.driver.code === selectedDriver);
  const lapTimes = generateMockLapTimes(selectedDriver, 58);

  // Champion leader data
  const leader = driverStandings[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            F1 Pulse{" "}
            <span className="text-racing-blue glow-text">{year}</span>
          </h1>
          <p className="text-sm text-white/40 mt-1">Season overview and championship analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-carbon-800 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white/80 cursor-pointer"
          >
            {[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className={cn(
            "flex items-center gap-2 text-xs font-mono",
            isLiveSession ? "text-racing-green" : "text-white/30"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isLiveSession ? "bg-racing-green animate-pulse shadow-[0_0_8px_rgba(0,210,190,0.6)]" : "bg-racing-green/50"
            )} />
            {isLiveSession ? "LIVE" : "Live Data"}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Latest Race",
            value: latestRace ? getMeetingName(latestRace.meeting_key).replace(" Grand Prix", " GP") || latestRace.circuit_short_name : "—",
            sub: latestRace ? `${latestRace.circuit_short_name}, ${latestRace.country_name}` : "",
            icon: Flag, color: "#E10600",
          },
          {
            label: "Next Race",
            value: nextRace ? getMeetingName(nextRace.meeting_key).replace(" Grand Prix", " GP") || nextRace.circuit_short_name : "Season Complete",
            sub: nextRace ? new Date(nextRace.date_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
            icon: Calendar, color: "#3B82F6",
          },
          {
            label: "Races Completed",
            value: `${pastRaces.length}/${sessions.length}`,
            sub: `${year} Season`,
            icon: Trophy, color: "#F59E0B",
          },
          {
            label: "Championship Leader",
            value: leader ? leader.driver.code : "—",
            sub: leader ? `${leader.points} pts` : "",
            icon: Gauge,
            color: leader?.driver.teamColor || "#3671C6",
          },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">{stat.label}</span>
              <stat.icon className="w-4 h-4" style={{ color: stat.color, opacity: 0.6 }} />
            </div>
            <div className="stat-number text-xl sm:text-2xl" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs text-white/40 font-mono">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Championship Chart + Standings */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-racing-blue" />
              <h2 className="text-sm font-semibold">Championship Progress</h2>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button onClick={() => setActiveTab("drivers")}
                className={cn("px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  activeTab === "drivers" ? "bg-racing-blue/20 text-racing-blue" : "text-white/40 hover:text-white/60")}>
                Drivers
              </button>
              <button onClick={() => setActiveTab("constructors")}
                className={cn("px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  activeTab === "constructors" ? "bg-racing-blue/20 text-racing-blue" : "text-white/40 hover:text-white/60")}>
                Constructors
              </button>
            </div>
          </div>
          {standingsLoading ? (
            <div className="flex items-center justify-center h-[400px]">
              <Loader2 className="w-5 h-5 text-racing-blue animate-spin" />
            </div>
          ) : activeTab === "drivers" ? (
            champStandings.length > 0 ? (
              <ChampionshipChart drivers={champStandings} races={champRaceNames} />
            ) : (
              <div className="flex items-center justify-center h-[400px] text-white/30 text-sm">
                No championship data available for {year}
              </div>
            )
          ) : (
            constructorChartData.length > 0 ? (
              <ConstructorBarChart constructors={constructorChartData} />
            ) : (
              <div className="flex items-center justify-center h-[300px] text-white/30 text-sm">
                No constructor data available for {year}
              </div>
            )
          )}
        </div>

        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-racing-amber" />
            {activeTab === "drivers" ? "Driver Standings" : "Constructor Standings"}
          </h2>
          {standingsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-racing-blue animate-spin" />
            </div>
          ) : (
            <div className="space-y-1 fade-bottom max-h-[400px] overflow-y-auto">
              {activeTab === "drivers"
                ? driverStandings.map((d, i) => (
                    <button key={d.driver.code} onClick={() => setSelectedDriver(d.driver.code)}
                      className={cn("lap-row w-full text-left cursor-pointer", selectedDriver === d.driver.code && "bg-white/5 ring-1 ring-white/10")}>
                      <span className={cn("pos-badge", i === 0 && "p1", i === 1 && "p2", i === 2 && "p3")}>{d.position}</span>
                      <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: d.driver.teamColor || getTeamColor(d.driver.team) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{d.driver.name}</div>
                        <div className="text-[10px] text-white/30">{d.driver.team}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono text-sm font-bold">{d.points}</div>
                        <div className="text-[10px] text-white/30">{d.wins}W</div>
                      </div>
                    </button>
                  ))
                : constructorStandings.map((c, i) => (
                    <div key={c.team} className="lap-row">
                      <span className={cn("pos-badge", i === 0 && "p1", i === 1 && "p2", i === 2 && "p3")}>{c.position}</span>
                      <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: c.teamColor || getTeamColor(c.team) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{c.team}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono text-sm font-bold">{c.points}</div>
                        <div className="text-[10px] text-white/30">{c.wins}W</div>
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>

      {/* Latest Race Results */}
      {raceResults.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-racing-red" />
              <h2 className="text-sm font-semibold">
                Latest Result — {raceResults[raceResults.length - 1]?.raceName}
              </h2>
            </div>
            <span className="text-[10px] text-white/30 font-mono">
              {raceResults[raceResults.length - 1]?.date}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {raceResults[raceResults.length - 1]?.results.slice(0, 10).map((r, i) => (
              <div key={r.driver.code} className={cn(
                "flex items-center gap-3 p-3 rounded-xl",
                i === 0 ? "bg-amber-500/10 ring-1 ring-amber-500/20" :
                i === 1 ? "bg-gray-300/5 ring-1 ring-gray-300/10" :
                i === 2 ? "bg-orange-700/10 ring-1 ring-orange-700/20" :
                "bg-white/[0.02]"
              )}>
                <span className={cn("pos-badge", i === 0 && "p1", i === 1 && "p2", i === 2 && "p3")}>
                  {r.position}
                </span>
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: r.driver.teamColor || getTeamColor(r.driver.team) }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{r.driver.code}</div>
                  <div className="text-[10px] text-white/30 truncate">{r.driver.team}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-bold text-racing-amber">{r.points > 0 ? `+${r.points}` : "0"}</div>
                  <div className="text-[10px] text-white/25">{r.time || r.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Predictions */}
      {nextRace && (
        <PredictionPanel
          year={year}
          nextRaceCircuit={nextRace?.circuit_short_name}
          nextRaceName={getMeetingName(nextRace?.meeting_key) || nextRace?.circuit_short_name}
        />
      )}

      {/* Lap Times + Strategy */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-racing-amber" />
              <h2 className="text-sm font-semibold">Lap Times — {selectedDriver}</h2>
            </div>
          </div>
          <LapTimesChart
            data={lapTimes}
            driverCode={selectedDriver}
            teamColor={selectedDriverData?.driver.teamColor || getTeamColor(selectedDriverData?.driver.team || "")}
          />
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-racing-green" />
              <h2 className="text-sm font-semibold">Race Strategy</h2>
            </div>
          </div>
          <StrategyChart strategies={mockStrategyData} totalLaps={58} />
        </div>
      </div>

      {/* Race Calendar — REAL DATA */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-racing-blue" />
            <h2 className="text-sm font-semibold">{year} Race Calendar</h2>
          </div>
          <span className="text-[10px] text-white/30 font-mono">
            {pastRaces.length} completed · {upcomingRaces.length} remaining
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-racing-blue animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {sessions.map((race, idx) => {
              const isPast = new Date(race.date_start) < now;
              const isNext = nextRace?.session_key === race.session_key;
              const name = getMeetingName(race.meeting_key) || race.circuit_short_name;

              return (
                <Link
                  key={race.session_key}
                  href="/race"
                  className={cn(
                    "glass-card-hover p-3 group relative",
                    isNext && "ring-1 ring-racing-blue/40 glow-border",
                    !isPast && !isNext && "opacity-60"
                  )}
                >
                  {isNext && (
                    <div className="absolute -top-2 right-3 bg-racing-blue text-[8px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Next
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-white/30">R{String(idx + 1).padStart(2, "0")}</span>
                    {isPast && <div className="w-1.5 h-1.5 rounded-full bg-racing-green" />}
                    <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-racing-blue transition-colors" />
                  </div>
                  <div className="text-sm font-semibold truncate">
                    {name.replace(" Grand Prix", " GP")}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <MapPin className="w-3 h-3 text-white/20" />
                    <span className="text-[10px] text-white/35 truncate">{race.circuit_short_name}, {race.country_name}</span>
                  </div>
                  <div className="text-[10px] font-mono text-white/20 mt-1">
                    {new Date(race.date_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
