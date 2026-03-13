"use client";

import { useState, useEffect, useMemo } from "react";
/* eslint-disable @next/next/no-img-element */
import {
  Swords, Trophy, Flag, Timer, TrendingUp, ChevronDown,
  Loader2, Zap, Target, AlertTriangle, Award,
} from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";
import { getTeamLogoUrl, getTeamInfo, getDriverHeadshot } from "@/lib/team-logos";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine,
} from "recharts";

function TeamLogo({ teamName, size = "sm" }: { teamName: string; size?: "sm" | "md" }) {
  const [imgError, setImgError] = useState(false);
  const url = getTeamLogoUrl(teamName);
  const info = getTeamInfo(teamName);
  const sizeClass = size === "md" ? "w-6 h-6" : "w-4 h-4";
  if (!url || imgError) return null;
  return (
    <div className={cn(sizeClass, "flex-shrink-0")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={teamName} className="w-full h-full object-contain" onError={() => setImgError(true)} loading="lazy" />
    </div>
  );
}

function DriverAvatar({ code, teamColor, size = "sm" }: { code: string; teamColor: string; size?: "sm" | "md" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const url = getDriverHeadshot(code);
  const sizeMap = { sm: "w-8 h-8", md: "w-12 h-12", lg: "w-16 h-16" };
  const textMap = { sm: "text-xs", md: "text-base", lg: "text-xl" };

  if (!url || imgError) {
    return (
      <div className={cn(sizeMap[size], "rounded-full flex items-center justify-center font-mono font-bold", textMap[size])}
        style={{ backgroundColor: `${teamColor}25`, color: teamColor }}>
        {code.charAt(0)}
      </div>
    );
  }
  return (
    <div className={cn(sizeMap[size], "rounded-full overflow-hidden bg-[var(--f1-hover)] flex-shrink-0")} style={{ border: `2px solid ${teamColor}40` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={code} className="w-full h-full object-cover object-top" onError={() => setImgError(true)} loading="lazy" />
    </div>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────

interface DriverInfo {
  code: string;
  name: string;
  number: number;
  nationality: string;
  team: string;
  teamColor: string;
  championshipPos: number;
}

interface RaceH2H {
  round: number;
  raceName: string;
  circuit: string;
  country: string;
  date: string;
  driver1: { position: number; grid: number; points: number; status: string; time: string | null } | null;
  driver2: { position: number; grid: number; points: number; status: string; time: string | null } | null;
}

interface H2HData {
  year: number;
  driver1: DriverInfo | null;
  driver2: DriverInfo | null;
  raceH2H: RaceH2H[];
  stats: {
    points: { d1: number; d2: number };
    wins: { d1: number; d2: number };
    podiums: { d1: number; d2: number };
    poles: { d1: number; d2: number };
    dnfs: { d1: number; d2: number };
    bestFinish: { d1: number | null; d2: number | null };
    avgFinish: { d1: number | null; d2: number | null };
    avgQuali: { d1: number | null; d2: number | null };
    raceH2H: { d1: number; d2: number };
    qualiH2H: { d1: number; d2: number };
  };
  pointsProgression: {
    raceNames: string[];
    d1: number[];
    d2: number[];
  };
  qualiGaps: { round: number; raceName: string; d1Pos: number; d2Pos: number; gap: number }[];
}

interface StandingEntry {
  driver: { code: string; name: string; team: string; teamColor: string };
  position: number;
  points: number;
}

// ─── Stat Battle Bar ────────────────────────────────────────────────────

function BattleBar({
  label,
  d1Val,
  d2Val,
  d1Color,
  d2Color,
  icon: Icon,
  format = "number",
  lowerIsBetter = false,
}: {
  label: string;
  d1Val: number | null;
  d2Val: number | null;
  d1Color: string;
  d2Color: string;
  icon: React.ElementType;
  format?: "number" | "decimal";
  lowerIsBetter?: boolean;
}) {
  const v1 = d1Val ?? 0;
  const v2 = d2Val ?? 0;
  const total = v1 + v2 || 1;
  const pct1 = (v1 / total) * 100;
  const pct2 = (v2 / total) * 100;

  const d1Better = lowerIsBetter ? v1 < v2 : v1 > v2;
  const d2Better = lowerIsBetter ? v2 < v1 : v2 > v1;
  const formatVal = (v: number | null) =>
    v === null ? "—" : format === "decimal" ? v.toFixed(1) : String(v);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-sm font-mono font-bold tabular-nums",
            d1Better && "text-lg"
          )}
          style={{ color: d1Better ? d1Color : undefined }}
        >
          {formatVal(d1Val)}
        </span>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-f1-muted font-semibold">
          <Icon className="w-3 h-3" />
          {label}
        </div>
        <span
          className={cn(
            "text-sm font-mono font-bold tabular-nums",
            d2Better && "text-lg"
          )}
          style={{ color: d2Better ? d2Color : undefined }}
        >
          {formatVal(d2Val)}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-[var(--f1-hover)]">
        <div
          className="h-full transition-all duration-700 rounded-l-full"
          style={{ width: `${pct1}%`, backgroundColor: d1Color, opacity: d1Better ? 1 : 0.4 }}
        />
        <div
          className="h-full transition-all duration-700 rounded-r-full"
          style={{ width: `${pct2}%`, backgroundColor: d2Color, opacity: d2Better ? 1 : 0.4 }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function H2HPage() {
  const [year, setYear] = useState(2025);
  const [d1Code, setD1Code] = useState("VER");
  const [d2Code, setD2Code] = useState("NOR");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<H2HData | null>(null);
  const [driverList, setDriverList] = useState<StandingEntry[]>([]);

  // Load driver list for the year
  useEffect(() => {
    fetch(`/api/f1/standings/drivers?year=${year}`)
      .then((r) => r.json())
      .then((standings) => {
        if (Array.isArray(standings)) {
          setDriverList(standings);
          // Auto-select top 2 if current selections aren't in the list
          if (standings.length >= 2) {
            const codes = standings.map((s: StandingEntry) => s.driver.code);
            if (!codes.includes(d1Code)) setD1Code(standings[0].driver.code);
            if (!codes.includes(d2Code)) setD2Code(standings[1].driver.code);
          }
        }
      })
      .catch(console.error);
  }, [year]);

  // Fetch H2H data
  useEffect(() => {
    if (!d1Code || !d2Code || d1Code === d2Code) return;
    setLoading(true);
    fetch(`/api/f1/h2h?year=${year}&d1=${d1Code}&d2=${d2Code}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.stats) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, d1Code, d2Code]);

  const d1 = data?.driver1;
  const d2 = data?.driver2;
  const d1Color = d1?.teamColor || getTeamColor(d1?.team || "");
  const d2Color = d2?.teamColor || getTeamColor(d2?.team || "");

  // Points progression chart data
  const progressionData = useMemo(() => {
    if (!data) return [];
    return data.pointsProgression.raceNames.map((name, i) => ({
      race: name,
      d1: data.pointsProgression.d1[i] || 0,
      d2: data.pointsProgression.d2[i] || 0,
    }));
  }, [data]);

  // Qualifying gap chart data
  const qualiGapData = useMemo(() => {
    if (!data) return [];
    return data.qualiGaps.map((q) => ({
      race: q.raceName.replace(" Grand Prix", " GP"),
      gap: -q.gap, // positive = d1 ahead
      d1Ahead: q.gap < 0,
    }));
  }, [data]);

  // Race-by-race results
  const raceByRace = data?.raceH2H || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight flex items-center gap-3">
            <Swords className="w-7 h-7 text-f1-red" />
            Head to Head
          </h1>
          <p className="text-sm text-f1-muted mt-1">
            Driver battle comparison — race results, qualifying, and season stats
          </p>
        </div>

        <div className="relative">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="appearance-none bg-[var(--f1-hover)] border border-[var(--f1-border)] rounded-lg pl-3 pr-8 py-1.5 text-sm font-mono text-f1-sub cursor-pointer hover:border-f1-red/30 transition-colors outline-none"
          >
            {[2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
              <option key={y} value={y} className="bg-[var(--f1-card)]">{y}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
        </div>
      </div>

      {/* ═══ Driver Picker ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
        {/* Driver 1 */}
        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: d1Color }} />
          <div className="flex items-center gap-3">
            <DriverAvatar code={d1Code} teamColor={d1Color} size="md" />
            <div className="flex-1 min-w-0">
              <select
                value={d1Code}
                onChange={(e) => setD1Code(e.target.value)}
                className="w-full bg-transparent text-lg sm:text-xl font-display font-black uppercase tracking-tight outline-none cursor-pointer appearance-none"
              >
                {driverList.map((s) => (
                  <option key={s.driver.code} value={s.driver.code} className="bg-[var(--f1-card)] text-sm normal-case">
                    {s.driver.name}
                  </option>
                ))}
              </select>
              {d1 && (
                <div className="mt-1 flex items-center gap-2">
                  <TeamLogo teamName={d1.team} size="sm" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: d1Color }}>
                    {d1.team}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--f1-text-dim)]">P{d1.championshipPos}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* VS badge */}
        <div className="w-12 h-12 rounded-full bg-f1-red/10 border-2 border-f1-red/30 flex items-center justify-center mx-auto sm:mx-0">
          <span className="text-xs font-display font-black text-f1-red">VS</span>
        </div>

        {/* Driver 2 */}
        <div className="glass-card p-4 relative overflow-hidden text-right">
          <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: d2Color }} />
          <div className="flex items-center gap-3 flex-row-reverse">
            <DriverAvatar code={d2Code} teamColor={d2Color} size="md" />
            <div className="flex-1 min-w-0">
              <select
                value={d2Code}
                onChange={(e) => setD2Code(e.target.value)}
                className="w-full bg-transparent text-lg sm:text-xl font-display font-black uppercase tracking-tight outline-none cursor-pointer appearance-none text-right"
              >
                {driverList.map((s) => (
                  <option key={s.driver.code} value={s.driver.code} className="bg-[var(--f1-card)] text-sm normal-case">
                    {s.driver.name}
                  </option>
                ))}
              </select>
              {d2 && (
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className="text-[10px] font-mono text-[var(--f1-text-dim)]">P{d2.championshipPos}</span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: d2Color }}>
                    {d2.team}
                  </span>
                  <TeamLogo teamName={d2.team} size="sm" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Loading ═══ */}
      {loading && (
        <div className="glass-card p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-f1-red animate-spin" />
          <span className="text-xs text-f1-muted font-mono">Loading battle data...</span>
        </div>
      )}

      {/* ═══ Same driver warning ═══ */}
      {d1Code === d2Code && !loading && (
        <div className="glass-card p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-racing-amber mx-auto mb-2" />
          <p className="text-f1-muted text-sm">Select two different drivers to compare</p>
        </div>
      )}

      {/* ═══ Battle Stats ═══ */}
      {data && !loading && d1Code !== d2Code && (
        <>
          {/* H2H Record — big numbers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-5 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: d1Color }} />
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--f1-text-dim)] mb-1">Race Wins H2H</div>
              <div className="text-4xl sm:text-5xl font-display font-black" style={{ color: d1Color }}>
                {data.stats.raceH2H.d1}
              </div>
              <div className="text-[10px] font-mono text-f1-muted mt-1">races ahead</div>
            </div>
            <div className="glass-card p-5 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: d2Color }} />
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--f1-text-dim)] mb-1">Race Wins H2H</div>
              <div className="text-4xl sm:text-5xl font-display font-black" style={{ color: d2Color }}>
                {data.stats.raceH2H.d2}
              </div>
              <div className="text-[10px] font-mono text-f1-muted mt-1">races ahead</div>
            </div>
          </div>

          {/* Battle bars */}
          <div className="glass-card p-5 space-y-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-display font-bold uppercase" style={{ color: d1Color }}>{d1?.code}</span>
              <span className="text-[9px] font-mono text-[var(--f1-text-dim)] uppercase tracking-wider">Season Stats</span>
              <span className="text-xs font-display font-bold uppercase" style={{ color: d2Color }}>{d2?.code}</span>
            </div>

            <BattleBar label="Points" d1Val={data.stats.points.d1} d2Val={data.stats.points.d2} d1Color={d1Color} d2Color={d2Color} icon={Trophy} />
            <BattleBar label="Wins" d1Val={data.stats.wins.d1} d2Val={data.stats.wins.d2} d1Color={d1Color} d2Color={d2Color} icon={Flag} />
            <BattleBar label="Podiums" d1Val={data.stats.podiums.d1} d2Val={data.stats.podiums.d2} d1Color={d1Color} d2Color={d2Color} icon={Award} />
            <BattleBar label="Poles" d1Val={data.stats.poles.d1} d2Val={data.stats.poles.d2} d1Color={d1Color} d2Color={d2Color} icon={Zap} />
            <BattleBar label="Quali H2H" d1Val={data.stats.qualiH2H.d1} d2Val={data.stats.qualiH2H.d2} d1Color={d1Color} d2Color={d2Color} icon={Timer} />
            <BattleBar label="Avg Finish" d1Val={data.stats.avgFinish.d1} d2Val={data.stats.avgFinish.d2} d1Color={d1Color} d2Color={d2Color} icon={Target} format="decimal" lowerIsBetter />
            <BattleBar label="Avg Quali" d1Val={data.stats.avgQuali.d1} d2Val={data.stats.avgQuali.d2} d1Color={d1Color} d2Color={d2Color} icon={TrendingUp} format="decimal" lowerIsBetter />
            <BattleBar label="DNFs" d1Val={data.stats.dnfs.d1} d2Val={data.stats.dnfs.d2} d1Color={d1Color} d2Color={d2Color} icon={AlertTriangle} lowerIsBetter />
          </div>

          {/* ═══ Points Progression Chart ═══ */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-f1-red/60" />
              <h2 className="text-sm font-semibold">Points Progression</h2>
            </div>
            {progressionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={progressionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--f1-border)" />
                  <XAxis
                    dataKey="race"
                    tick={{ fontSize: 9, fill: "var(--f1-text-dim)" }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={Math.max(0, Math.floor(progressionData.length / 10))}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "var(--f1-text-dim)" }} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--f1-card)",
                      border: "1px solid var(--f1-border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="d1"
                    name={d1?.code || "D1"}
                    stroke={d1Color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="d2"
                    name={d2?.code || "D2"}
                    stroke={d2Color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-f1-muted text-sm font-mono">
                No progression data
              </div>
            )}
          </div>

          {/* ═══ Qualifying Gap Chart ═══ */}
          {qualiGapData.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-4 h-4 text-f1-red/60" />
                <h2 className="text-sm font-semibold">Qualifying Battle</h2>
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-[var(--f1-text-dim)] mb-4">
                <span style={{ color: d1Color }}>← {d1?.code} ahead</span>
                <span style={{ color: d2Color }}>{d2?.code} ahead →</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={qualiGapData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--f1-border)" vertical={false} />
                  <XAxis
                    dataKey="race"
                    tick={{ fontSize: 9, fill: "var(--f1-text-dim)" }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={Math.max(0, Math.floor(qualiGapData.length / 10))}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--f1-text-dim)" }}
                    width={30}
                    domain={["auto", "auto"]}
                  />
                  <ReferenceLine y={0} stroke="var(--f1-border)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--f1-card)",
                      border: "1px solid var(--f1-border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) =>
                      value > 0 ? `${d1?.code} ahead by ${value} pos` : `${d2?.code} ahead by ${Math.abs(value)} pos`
                    }
                  />
                  <Bar dataKey="gap" radius={[3, 3, 0, 0]}>
                    {qualiGapData.map((entry, i) => (
                      <Cell key={i} fill={entry.d1Ahead ? d1Color : d2Color} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ═══ Race-by-Race Results ═══ */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flag className="w-4 h-4 text-f1-red/60" />
              <h2 className="text-sm font-semibold">Race by Race</h2>
            </div>
            <div className="space-y-1">
              {raceByRace.map((race) => {
                const r1 = race.driver1;
                const r2 = race.driver2;
                const d1Won = r1 && r2 && r1.position < r2.position;
                const d2Won = r1 && r2 && r2.position < r1.position;

                return (
                  <div
                    key={race.round}
                    className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-[var(--f1-hover)] transition-colors"
                  >
                    {/* Round */}
                    <span className="text-[10px] font-mono text-[var(--f1-text-dim)] w-8 flex-shrink-0">
                      R{String(race.round).padStart(2, "0")}
                    </span>

                    {/* D1 result */}
                    <div className={cn("w-8 text-center flex-shrink-0", d1Won && "font-bold")} style={{ color: d1Won ? d1Color : undefined }}>
                      <span className="text-sm font-mono">{r1 ? `P${r1.position}` : "—"}</span>
                    </div>

                    {/* Winner indicator */}
                    <div className="w-2 flex-shrink-0 flex justify-center">
                      {d1Won && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d1Color }} />}
                      {d2Won && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d2Color }} />}
                    </div>

                    {/* D2 result */}
                    <div className={cn("w-8 text-center flex-shrink-0", d2Won && "font-bold")} style={{ color: d2Won ? d2Color : undefined }}>
                      <span className="text-sm font-mono">{r2 ? `P${r2.position}` : "—"}</span>
                    </div>

                    {/* Race name */}
                    <span className="text-xs text-f1-sub truncate flex-1 ml-2">
                      {race.raceName.replace(" Grand Prix", " GP")}
                    </span>

                    {/* Points */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] font-mono tabular-nums" style={{ color: d1Color, opacity: r1?.points ? 1 : 0.3 }}>
                        {r1?.points ? `+${r1.points}` : "0"}
                      </span>
                      <span className="text-[var(--f1-text-dim)] text-[10px]">|</span>
                      <span className="text-[10px] font-mono tabular-nums" style={{ color: d2Color, opacity: r2?.points ? 1 : 0.3 }}>
                        {r2?.points ? `+${r2.points}` : "0"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {raceByRace.length === 0 && (
                <div className="py-8 text-center text-f1-muted text-sm font-mono">
                  No race data available for {year}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
