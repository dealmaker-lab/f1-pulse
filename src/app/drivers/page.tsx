"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Trophy, Flag, Timer, TrendingUp, Loader2 } from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";
import { DriverStanding } from "@/types/f1";
import ChampionshipChart from "@/components/charts/championship-chart";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from "recharts";

// Career stats mapping (through end of 2024 season)
const CAREER_STATS: Record<string, { championships: number; wins: number; podiums: number; poles: number }> = {
  VER: { championships: 4, wins: 63, podiums: 111, poles: 40 },
  HAM: { championships: 7, wins: 105, podiums: 202, poles: 104 },
  ALO: { championships: 2, wins: 32, podiums: 106, poles: 22 },
  LEC: { championships: 0, wins: 8, podiums: 40, poles: 25 },
  NOR: { championships: 0, wins: 7, podiums: 30, poles: 10 },
  SAI: { championships: 0, wins: 4, podiums: 25, poles: 8 },
  RUS: { championships: 0, wins: 3, podiums: 16, poles: 5 },
  PIA: { championships: 0, wins: 4, podiums: 20, poles: 5 },
  PER: { championships: 0, wins: 6, podiums: 39, poles: 3 },
  ALB: { championships: 0, wins: 0, podiums: 7, poles: 0 },
  STR: { championships: 0, wins: 0, podiums: 3, poles: 0 },
  GAS: { championships: 0, wins: 1, podiums: 9, poles: 1 },
  TSU: { championships: 0, wins: 0, podiums: 2, poles: 0 },
  OCO: { championships: 0, wins: 1, podiums: 3, poles: 0 },
  HUL: { championships: 0, wins: 0, podiums: 14, poles: 2 },
  MAG: { championships: 0, wins: 0, podiums: 1, poles: 1 },
  BOT: { championships: 0, wins: 10, podiums: 67, poles: 20 },
  ZHO: { championships: 0, wins: 0, podiums: 0, poles: 0 },
  SAR: { championships: 0, wins: 0, podiums: 0, poles: 0 },
  RIC: { championships: 0, wins: 8, podiums: 32, poles: 3 },
  LAW: { championships: 0, wins: 0, podiums: 0, poles: 0 },
  BEA: { championships: 0, wins: 0, podiums: 1, poles: 0 },
  ANT: { championships: 0, wins: 0, podiums: 0, poles: 0 },
  COL: { championships: 0, wins: 0, podiums: 0, poles: 0 },
  BOR: { championships: 0, wins: 0, podiums: 0, poles: 0 },
  DOO: { championships: 0, wins: 0, podiums: 0, poles: 0 },
  HAD: { championships: 0, wins: 0, podiums: 0, poles: 0 },
};

// Driver headshot URLs using official F1 CDN pattern
// Format: firstname-lastname (lowercase, hyphenated)
const DRIVER_HEADSHOTS: Record<string, string> = {
  VER: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/M/MAXVER01_Max_Verstappen/maxver01.png.transform/1col/image.png",
  HAM: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LEWHAM01_Lewis_Hamilton/lewham01.png.transform/1col/image.png",
  NOR: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LANNOR01_Lando_Norris/lannor01.png.transform/1col/image.png",
  LEC: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/C/CHALEC01_Charles_Leclerc/chalec01.png.transform/1col/image.png",
  SAI: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/C/CARSAI01_Carlos_Sainz/carsai01.png.transform/1col/image.png",
  PIA: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/O/OSCPIA01_Oscar_Piastri/oscpia01.png.transform/1col/image.png",
  RUS: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/G/GEORUS01_George_Russell/georus01.png.transform/1col/image.png",
  ALO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/F/FERALO01_Fernando_Alonso/feralo01.png.transform/1col/image.png",
  PER: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/S/SERPER01_Sergio_Perez/serper01.png.transform/1col/image.png",
  STR: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LANSTR01_Lance_Stroll/lanstr01.png.transform/1col/image.png",
  GAS: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/P/PIEGAS01_Pierre_Gasly/piegas01.png.transform/1col/image.png",
  OCO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/E/ESTOCO01_Esteban_Ocon/estoco01.png.transform/1col/image.png",
  TSU: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/Y/YUKTSU01_Yuki_Tsunoda/yuktsu01.png.transform/1col/image.png",
  ALB: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/A/ALEALB01_Alexander_Albon/alealb01.png.transform/1col/image.png",
  HUL: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/N/NICHUL01_Nico_Hulkenberg/nichul01.png.transform/1col/image.png",
  MAG: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/K/KEVMAG01_Kevin_Magnussen/kevmag01.png.transform/1col/image.png",
  BOT: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/V/VALBOT01_Valtteri_Bottas/valbot01.png.transform/1col/image.png",
  ZHO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/G/GUAZHO01_Guanyu_Zhou/guazho01.png.transform/1col/image.png",
  RIC: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/D/DANRIC01_Daniel_Ricciardo/danric01.png.transform/1col/image.png",
  LAW: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/L/LIALAW01_Liam_Lawson/lialaw01.png.transform/1col/image.png",
  BEA: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/O/OLIBEA01_Oliver_Bearman/olibea01.png.transform/1col/image.png",
  COL: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/F/FRACO01_Franco_Colapinto/fraco01.png.transform/1col/image.png",
  DOO: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/J/JACDOO01_Jack_Doohan/jacdoo01.png.transform/1col/image.png",
  ANT: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/A/ANDANT01_Andrea_Kimi_Antonelli/andant01.png.transform/1col/image.png",
  HAD: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/I/ISAHAD01_Isack_Hadjar/isahad01.png.transform/1col/image.png",
  BOR: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/G/GABBO01_Gabriel_Bortoleto/gabbo01.png.transform/1col/image.png",
};

function getCareerStats(code: string) {
  return CAREER_STATS[code] || { championships: 0, wins: 0, podiums: 0, poles: 0 };
}

function getHeadshot(code: string) {
  return DRIVER_HEADSHOTS[code] || null;
}

// Normalize stats for radar chart comparison
function getRadarData(code1: string, code2: string, standings: DriverStanding[]) {
  const p1 = getCareerStats(code1);
  const p2 = getCareerStats(code2);
  const normalize = (val: number, max: number) => Math.min(100, (val / max) * 100);
  const s1 = standings.find((d) => d.driver.code === code1);
  const s2 = standings.find((d) => d.driver.code === code2);

  return [
    { stat: "Wins", [code1]: normalize(p1.wins, 110), [code2]: normalize(p2.wins, 110) },
    { stat: "Poles", [code1]: normalize(p1.poles, 110), [code2]: normalize(p2.poles, 110) },
    { stat: "Podiums", [code1]: normalize(p1.podiums, 210), [code2]: normalize(p2.podiums, 210) },
    { stat: "WDC", [code1]: normalize(p1.championships, 8), [code2]: normalize(p2.championships, 8) },
    { stat: "Season Pts", [code1]: normalize(s1?.points || 0, 500), [code2]: normalize(s2?.points || 0, 500) },
  ];
}

// Headshot image component with fallback
function DriverHeadshot({ code, teamColor, size = "sm" }: { code: string; teamColor: string; size?: "sm" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const url = getHeadshot(code);
  const sizeClass = size === "lg" ? "w-20 h-20" : "w-10 h-10";
  const textSize = size === "lg" ? "text-2xl" : "text-sm";

  if (!url || imgError) {
    return (
      <div
        className={cn(sizeClass, "rounded-full flex items-center justify-center font-mono font-bold", textSize)}
        style={{ backgroundColor: `${teamColor}25`, color: teamColor }}
      >
        {code.charAt(0)}
      </div>
    );
  }

  return (
    <div className={cn(sizeClass, "rounded-full overflow-hidden bg-white/5 flex-shrink-0")} style={{ border: `2px solid ${teamColor}40` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={code}
        className="w-full h-full object-cover object-top"
        onError={() => setImgError(true)}
        loading="lazy"
      />
    </div>
  );
}

export default function DriversPage() {
  const [year, setYear] = useState(2025);
  const [standings, setStandings] = useState<DriverStanding[]>([]);
  const [raceNames, setRaceNames] = useState<string[]>([]);
  const [selectedDriver, setSelectedDriver] = useState("VER");
  const [compareDriver, setCompareDriver] = useState("HAM");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch driver standings and results for progression
  const fetchData = useCallback(async (selectedYear: number) => {
    try {
      setLoading(true);
      setError(null);

      const [standingsRes, resultsRes] = await Promise.all([
        fetch(`/api/f1/standings/drivers?year=${selectedYear}`, { cache: "no-store" }),
        fetch(`/api/f1/results?year=${selectedYear}`, { cache: "no-store" }),
      ]);

      if (!standingsRes.ok) throw new Error("Failed to fetch standings");

      const standingsData = await standingsRes.json();
      const resultsData = resultsRes.ok ? await resultsRes.json() : [];

      // Extract race names from results
      const races: string[] = Array.isArray(resultsData)
        ? resultsData.map((r: any) => r.raceName || r.name || `Round ${r.round}`)
        : [];
      setRaceNames(races);

      // Compute podiums and pointsHistory from results if standings don't have them
      const enriched = (Array.isArray(standingsData) ? standingsData : []).map((s: any) => {
        // Count podiums from results
        let podiums = 0;
        const pointsByRound: number[] = [];
        let cumPoints = 0;

        if (Array.isArray(resultsData)) {
          for (const race of resultsData) {
            const dResult = (race.results || []).find((r: any) => r.driver?.code === s.driver?.code);
            if (dResult) {
              if (dResult.position <= 3) podiums++;
              cumPoints += dResult.points || 0;
            }
            pointsByRound.push(cumPoints);
          }
        }

        return {
          ...s,
          podiums: podiums || s.podiums || 0,
          pointsHistory: pointsByRound.length > 0 ? pointsByRound : s.pointsHistory || [],
        };
      });

      setStandings(enriched);

      // Update selected driver if not in new standings
      if (enriched.length > 0 && !enriched.some((d: any) => d.driver.code === selectedDriver)) {
        setSelectedDriver(enriched[0].driver.code);
      }
      if (enriched.length > 1 && !enriched.some((d: any) => d.driver.code === compareDriver)) {
        setCompareDriver(enriched.length > 1 ? enriched[1].driver.code : enriched[0].driver.code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching data");
      setStandings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDriver, compareDriver]);

  useEffect(() => {
    fetchData(year);
  }, [year, fetchData]);

  const driver = standings.find((d) => d.driver.code === selectedDriver);
  const compareDriverStanding = standings.find((d) => d.driver.code === compareDriver);
  const careerStats = getCareerStats(selectedDriver);
  const radarData = getRadarData(selectedDriver, compareDriver, standings);

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-racing-amber" />
            Driver Profiles
          </h1>
        </div>
        <div className="glass-card p-6 text-red-400"><p>Error: {error}</p></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-racing-amber" />
            Driver Profiles
          </h1>
        </div>
        <div className="glass-card p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-racing-amber" />
          <span className="text-sm text-white/50">Loading driver data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Year Selector */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Users className="w-7 h-7 text-racing-amber" />
            Driver Profiles
          </h1>
          <p className="text-sm text-white/40 mt-1">Career stats, performance, and head-to-head comparison</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-carbon-800 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white/80 cursor-pointer"
        >
          {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Driver Grid with Headshots */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 xl:grid-cols-10 gap-2">
        {standings.map((d) => (
          <button
            key={d.driver.code}
            onClick={() => setSelectedDriver(d.driver.code)}
            className={cn(
              "glass-card-hover p-3 text-center cursor-pointer transition-all",
              selectedDriver === d.driver.code && "ring-1 ring-white/20 bg-white/5"
            )}
          >
            <div className="flex justify-center mb-2">
              <DriverHeadshot code={d.driver.code} teamColor={d.driver.teamColor} size="sm" />
            </div>
            <div className="text-xs font-bold">{d.driver.code}</div>
            <div className="text-[9px] text-white/30 mt-0.5 truncate">{d.driver.team.replace(" Racing", "").replace(" F1 Team", "")}</div>
          </button>
        ))}
      </div>

      {/* Selected Driver Profile */}
      {driver && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Main card */}
          <div className="glass-card p-6 xl:col-span-1">
            <div className="flex items-center gap-4 mb-6">
              <DriverHeadshot code={driver.driver.code} teamColor={driver.driver.teamColor} size="lg" />
              <div>
                <div className="text-xl font-bold">{driver.driver.name}</div>
                <div className="text-sm text-white/40">{driver.driver.team}</div>
                <div className="text-xs text-white/30 font-mono mt-0.5">{driver.driver.nationality}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Championships", value: careerStats.championships, icon: Trophy, color: "#F59E0B" },
                { label: "Race Wins", value: careerStats.wins, icon: Flag, color: "#E10600" },
                { label: "Podiums", value: careerStats.podiums, icon: TrendingUp, color: "#00D2BE" },
                { label: "Pole Positions", value: careerStats.poles, icon: Timer, color: "#3B82F6" },
              ].map((s) => (
                <div key={s.label} className="bg-white/3 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <s.icon className="w-3 h-3" style={{ color: s.color }} />
                    <span className="text-[10px] uppercase tracking-widest text-white/30">{s.label}</span>
                  </div>
                  <div className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Season stats */}
            <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">{year} Season</h3>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">Championship Position</span>
                <span className="font-mono font-bold text-lg">P{driver.position}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">Points</span>
                <span className="font-mono font-bold" style={{ color: driver.driver.teamColor }}>{driver.points}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">Wins / Podiums</span>
                <span className="font-mono font-bold">{driver.wins}W / {driver.podiums || 0}P</span>
              </div>
              <p className="text-[9px] text-white/20 italic">Career stats through end of 2024</p>
            </div>
          </div>

          {/* Radar comparison */}
          <div className="glass-card p-5 xl:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Head-to-Head Comparison</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <DriverHeadshot code={selectedDriver} teamColor={driver.driver.teamColor} size="sm" />
                  <span className="text-[10px] font-mono" style={{ color: driver.driver.teamColor }}>{selectedDriver}</span>
                </div>
                <span className="text-white/20 text-xs">vs</span>
                <select
                  value={compareDriver}
                  onChange={(e) => setCompareDriver(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white/70 cursor-pointer appearance-none"
                >
                  {standings.filter(d => d.driver.code !== selectedDriver).map((d) => (
                    <option key={d.driver.code} value={d.driver.code}>{d.driver.code} — {d.driver.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="w-full h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.06)" />
                  <PolarAngleAxis dataKey="stat" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Fira Code" }} />
                  <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                  <Radar name={selectedDriver} dataKey={selectedDriver} stroke={getTeamColor(driver.driver.team)} fill={getTeamColor(driver.driver.team)} fillOpacity={0.2} strokeWidth={2} />
                  {compareDriverStanding && (
                    <Radar name={compareDriver} dataKey={compareDriver} stroke={getTeamColor(compareDriverStanding.driver.team)} fill={getTeamColor(compareDriverStanding.driver.team)} fillOpacity={0.15} strokeWidth={2} />
                  )}
                  <Tooltip contentStyle={{ background: "#151820", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontFamily: "Fira Code", fontSize: "11px" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Championship Progress */}
      {standings.length > 0 && raceNames.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold mb-4">Points Progression — {selectedDriver} vs {compareDriver}</h2>
          <ChampionshipChart
            drivers={standings.filter((d) => d.driver.code === selectedDriver || d.driver.code === compareDriver)}
            races={raceNames}
          />
        </div>
      )}
    </div>
  );
}
