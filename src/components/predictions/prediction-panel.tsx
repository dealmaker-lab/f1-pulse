"use client";

import { useState, useEffect } from "react";
import { Brain, Trophy, Timer, ChevronDown, ChevronUp, Zap, TrendingUp, BarChart3, Loader2 } from "lucide-react";
import { cn, getTeamColor } from "@/lib/utils";

interface PredictionEntry {
  code: string;
  name: string;
  team: string;
  teamColor: string;
  predictedPosition: number;
  confidence: number;
  raceScore?: number;
  qualifyingScore?: number;
  recentForm: number;
  circuitHistory: number;
  qualifyingPace: number;
  teamStrength: number;
  consistency: number;
}

interface PredictionData {
  qualifying: PredictionEntry[];
  race: PredictionEntry[];
  factors: {
    code: string;
    factors: {
      recentForm: number;
      circuitHistory: number;
      qualifyingPace: number;
      teamStrength: number;
      consistency: number;
    };
  }[];
  dataYears: number[];
  totalDataPoints: number;
  generatedAt: string;
}

interface Props {
  year: number;
  nextRaceCircuit?: string;
  nextRaceName?: string;
}

export default function PredictionPanel({ year, nextRaceCircuit, nextRaceName }: Props) {
  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"qualifying" | "race">("race");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year) });
    if (nextRaceCircuit) params.set("circuit", nextRaceCircuit);

    fetch(`/api/f1/predictions?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.qualifying) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, nextRaceCircuit]);

  if (loading) {
    return (
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-racing-purple" />
          <h2 className="text-sm font-semibold">AI Predictions</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 text-racing-purple animate-spin" />
          <span className="text-xs text-f1-muted font-mono">Analyzing {year - 3}–{year} data...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-racing-purple" />
          <h2 className="text-sm font-semibold">AI Predictions</h2>
        </div>
        <div className="text-center py-8 text-f1-muted text-sm">
          Not enough data to generate predictions for {year}
        </div>
      </div>
    );
  }

  const predictions = activeView === "qualifying" ? data.qualifying : data.race;
  const topThree = predictions.slice(0, 3);
  const rest = predictions.slice(3, 10);

  const getConfidenceColor = (c: number) => {
    if (c >= 80) return "#00D2BE";
    if (c >= 60) return "#F59E0B";
    return "#FF8000";
  };

  const factorMap = new Map(data.factors.map((f) => [f.code, f.factors]));

  return (
    <div className="glass-card p-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-racing-purple/15 flex items-center justify-center">
            <Brain className="w-4 h-4 text-racing-purple" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Next Race Predictions</h2>
            {nextRaceName && (
              <span className="text-[10px] text-f1-muted font-mono">{nextRaceName}</span>
            )}
          </div>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-[var(--f1-border)]">
          <button
            onClick={() => setActiveView("qualifying")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
              activeView === "qualifying" ? "bg-racing-purple/20 text-racing-purple" : "text-f1-muted hover:text-f1-sub"
            )}
          >
            <Timer className="w-3 h-3" />
            Quali
          </button>
          <button
            onClick={() => setActiveView("race")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
              activeView === "race" ? "bg-racing-purple/20 text-racing-purple" : "text-f1-muted hover:text-f1-sub"
            )}
          >
            <Trophy className="w-3 h-3" />
            Race
          </button>
        </div>
      </div>

      {/* Podium prediction — top 3 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {topThree.map((p, i) => (
          <div
            key={p.code}
            className={cn(
              "relative p-3 rounded-xl text-center transition-all duration-300",
              i === 0 ? "bg-racing-amber/10 ring-1 ring-racing-amber/20" :
              i === 1 ? "bg-[var(--f1-hover)] ring-1 ring-[var(--f1-border)]" :
              "bg-orange-900/10 ring-1 ring-orange-800/15"
            )}
          >
            <div className={cn(
              "text-[10px] font-mono font-bold uppercase tracking-wider mb-2",
              i === 0 ? "text-racing-amber" : i === 1 ? "text-f1-sub" : "text-orange-400"
            )}>
              P{i + 1}
            </div>
            <div
              className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-xs font-bold font-mono"
              style={{ backgroundColor: `${p.teamColor}25`, color: p.teamColor, border: `2px solid ${p.teamColor}40` }}
            >
              {p.code}
            </div>
            <div className="text-xs font-semibold truncate">{p.name.split(" ").pop()}</div>
            <div className="text-[10px] text-[var(--f1-text-dim)] truncate">{p.team}</div>
            <div className="mt-2">
              <div className="confidence-bar">
                <div
                  className="confidence-bar-fill"
                  style={{ width: `${p.confidence}%`, backgroundColor: getConfidenceColor(p.confidence) }}
                />
              </div>
              <div className="text-[9px] font-mono mt-1" style={{ color: getConfidenceColor(p.confidence) }}>
                {Math.round(p.confidence)}% conf
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rest of predictions — P4-P10 */}
      <div className="space-y-1">
        {rest.map((p) => {
          const isExpanded = expandedDriver === p.code;
          const factors = factorMap.get(p.code);

          return (
            <div key={p.code}>
              <button
                onClick={() => setExpandedDriver(isExpanded ? null : p.code)}
                className="lap-row w-full text-left cursor-pointer"
              >
                <span className="pos-badge">{p.predictedPosition}</span>
                <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: p.teamColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-[var(--f1-text-dim)]">{p.team}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-16">
                    <div className="confidence-bar">
                      <div
                        className="confidence-bar-fill"
                        style={{ width: `${p.confidence}%`, backgroundColor: getConfidenceColor(p.confidence) }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-f1-muted w-8 text-right">{Math.round(p.confidence)}%</span>
                  {isExpanded ? <ChevronUp className="w-3 h-3 text-[var(--f1-text-dim)]" /> : <ChevronDown className="w-3 h-3 text-[var(--f1-text-dim)]" />}
                </div>
              </button>

              {/* Expanded factor breakdown */}
              {isExpanded && factors && (
                <div className="ml-10 mr-2 mb-2 p-3 bg-[var(--f1-hover)] rounded-xl space-y-2 animate-fade-in">
                  <div className="text-[10px] uppercase tracking-wider text-f1-muted font-semibold mb-2">
                    Performance Factors
                  </div>
                  {[
                    { label: "Recent Form", value: factors.recentForm, max: 25, icon: TrendingUp, desc: "Avg pts/race (last 5)" },
                    { label: "Qualifying Pace", value: 21 - factors.qualifyingPace, max: 20, icon: Zap, desc: `Avg grid: P${factors.qualifyingPace.toFixed(1)}` },
                    { label: "Team Strength", value: 11 - factors.teamStrength, max: 10, icon: BarChart3, desc: `Constructor P${factors.teamStrength}` },
                    { label: "Consistency", value: 10 - factors.consistency, max: 10, icon: Trophy, desc: `Variance: ${factors.consistency.toFixed(1)}` },
                  ].map((f) => (
                    <div key={f.label} className="flex items-center gap-2">
                      <f.icon className="w-3 h-3 text-[var(--f1-text-dim)] flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-f1-sub">{f.label}</span>
                          <span className="text-[9px] font-mono text-f1-muted">{f.desc}</span>
                        </div>
                        <div className="h-1 rounded-full bg-[var(--f1-hover)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-racing-purple/60 transition-all duration-500"
                            style={{ width: `${Math.max(5, (f.value / f.max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer metadata */}
      <div className="mt-4 pt-3 border-t border-[var(--f1-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-racing-purple animate-pulse" />
          <span className="text-[9px] text-[var(--f1-text-dim)] font-mono">
            Based on {data.totalDataPoints} races · {data.dataYears.join("–")} data
          </span>
        </div>
        <span className="text-[9px] text-[var(--f1-text-dim)] font-mono">
          {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
