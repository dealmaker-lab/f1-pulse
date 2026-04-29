"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Activity,
  ChevronDown,
  Loader2,
  Flag,
  AlertTriangle,
  TrendingDown,
  ArrowUpDown,
  GitBranch,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OPENF1_YEARS } from "@/lib/constants";
import { SESSION_FILTER_OPTIONS, filterPastSessions } from "@/lib/session-filters";
import { buildRaceTrace, buildLapPositions } from "@/lib/race-trace-utils";
import {
  buildDegradationCurve,
  fitDegradationSlope,
} from "@/lib/tyre-degradation";
import RaceTraceChart from "@/components/charts/race-trace-chart";
import LapPositionChart from "@/components/charts/lap-position-chart";
import TyreDegradationChart from "@/components/charts/tyre-degradation-chart";
import SectorIndicators, {
  computeSectorColors,
} from "@/components/race/sector-indicators";

const YEARS = OPENF1_YEARS;

// ─── Types ─────────────────────────────────────────────────────────────

type AnalysisTab = "trace" | "positions" | "degradation" | "sectors";

type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

interface RaceSession {
  session_key: number;
  session_name: string;
  circuit_short_name: string;
  meeting_key: number;
  date: string;
  date_start: string;
}

interface LapData {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  date_start: string;
  is_pit_out_lap?: boolean;
  // Sector durations from OpenF1 — used by SectorIndicators
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
}

interface PositionEvent {
  driver_number: number;
  position: number;
  date: string;
}

interface DriverData {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

interface StintData {
  driver_number: number;
  compound: string | null;
  lap_start: number;
  lap_end: number | null;
  stint_number: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Coerce arbitrary stint compound strings to the chart's narrowed enum. */
function normalizeCompound(raw: string | null | undefined): Compound {
  if (!raw) return "UNKNOWN";
  const upper = raw.toUpperCase();
  if (
    upper === "SOFT" ||
    upper === "MEDIUM" ||
    upper === "HARD" ||
    upper === "INTERMEDIATE" ||
    upper === "WET"
  ) {
    return upper;
  }
  return "UNKNOWN";
}

// ─── Race selector card (adapted from strategy/page.tsx) ─────────────────

function RaceSelector({
  year,
  setYear,
  sessionType,
  setSessionType,
  races,
  loading,
  selected,
  setSelected,
}: {
  year: number;
  setYear: (y: number) => void;
  sessionType: string;
  setSessionType: (t: string) => void;
  races: RaceSession[];
  loading: boolean;
  selected: RaceSession | null;
  setSelected: (r: RaceSession) => void;
}) {
  const accent = "#DC2626"; // Ferrari red
  return (
    <div
      className="relative rounded-xl p-4 space-y-3 border bg-[var(--f1-hover)]"
      style={{ borderColor: `${accent}30` }}
    >
      {/* accent top bar */}
      <div
        className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />
      <div
        className="text-[9px] font-black uppercase tracking-[0.2em] font-mono"
        style={{ color: accent }}
      >
        Session
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Year */}
        <div className="relative">
          <select
            value={year}
            onChange={(e) => setYear(+e.target.value)}
            className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-f1 bg-[var(--f1-hover)] border border-[var(--f1-border)] outline-none focus:border-f1-sub transition-colors cursor-pointer"
            aria-label="Select year"
          >
            {YEARS.map((y) => (
              <option key={y} value={y} className="bg-[#0d0f14]">
                {y}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
        </div>

        {/* Session type */}
        <div className="relative">
          <select
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-f1 bg-[var(--f1-hover)] border border-[var(--f1-border)] outline-none focus:border-f1-sub transition-colors cursor-pointer"
            aria-label="Select session type"
          >
            {SESSION_FILTER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value} className="bg-[#0d0f14]">
                {t.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
        </div>

        {/* Race */}
        <div className="relative">
          {loading ? (
            <div className="flex items-center px-3 h-[38px] text-f1-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </div>
          ) : (
            <>
              <select
                value={selected?.session_key || ""}
                onChange={(e) => {
                  const r = races.find(
                    (x) => x.session_key === +e.target.value,
                  );
                  if (r) setSelected(r);
                }}
                className="w-full appearance-none px-3 py-2 pr-8 rounded-lg text-sm font-mono text-f1 bg-[var(--f1-hover)] border border-[var(--f1-border)] outline-none focus:border-f1-sub transition-colors cursor-pointer"
                aria-label="Select race"
              >
                <option value="" className="bg-[#0d0f14]">
                  Select race…
                </option>
                {races.map((r) => (
                  <option
                    key={r.session_key}
                    value={r.session_key}
                    className="bg-[#0d0f14]"
                  >
                    {r.circuit_short_name} ({r.session_name})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-f1-muted pointer-events-none" />
            </>
          )}
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-1.5 text-[10px] text-f1-muted font-mono">
          <Flag className="w-3 h-3" />
          {selected.circuit_short_name} · {year}
          {selected.date && (
            <span className="ml-1 text-[var(--f1-text-dim)]">
              {new Date(selected.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────

export default function RaceAnalysisPage() {
  const [year, setYear] = useState(2026);
  const [sessionType, setSessionType] = useState("Race");
  const [allRaces, setAllRaces] = useState<RaceSession[]>([]);
  const [race, setRace] = useState<RaceSession | null>(null);
  const [loadingRaces, setLoadingRaces] = useState(false);

  const [laps, setLaps] = useState<LapData[]>([]);
  const [positionEvents, setPositionEvents] = useState<PositionEvent[]>([]);
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [stints, setStints] = useState<StintData[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [errorData, setErrorData] = useState<string | null>(null);

  const [tab, setTab] = useState<AnalysisTab>("trace");

  // ── Load race list when year changes ──
  useEffect(() => {
    setLoadingRaces(true);
    setRace(null);
    fetch(`/api/f1/sessions?year=${year}`)
      .then((r) => r.json())
      .then((data) => {
        const arr: RaceSession[] = Array.isArray(data) ? data : [];
        setAllRaces(arr);
      })
      .catch(() => setAllRaces([]))
      .finally(() => setLoadingRaces(false));
  }, [year]);

  // Filter and sort races based on session type
  const races = useMemo(
    () => filterPastSessions(allRaces, sessionType),
    [allRaces, sessionType],
  );

  // Auto-select most recent race for the chosen session type
  useEffect(() => {
    if (races.length > 0) {
      setRace(races[races.length - 1]);
    } else {
      setRace(null);
    }
  }, [races]);

  // ── Load session data when race changes ──
  useEffect(() => {
    if (!race) {
      setLaps([]);
      setPositionEvents([]);
      setDrivers([]);
      setStints([]);
      setErrorData(null);
      return;
    }
    setLoadingData(true);
    setErrorData(null);
    setLaps([]);
    setPositionEvents([]);
    setDrivers([]);
    setStints([]);

    Promise.all([
      fetch(`/api/f1/laps?session_key=${race.session_key}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/f1/positions?session_key=${race.session_key}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/f1/drivers?session_key=${race.session_key}`).then((r) =>
        r.json(),
      ),
      fetch(`/api/f1/stints?session_key=${race.session_key}`).then((r) =>
        r.json(),
      ),
    ])
      .then(([lapsJson, posJson, drvJson, stintJson]) => {
        setLaps(Array.isArray(lapsJson) ? lapsJson : []);
        setPositionEvents(Array.isArray(posJson) ? posJson : []);
        setDrivers(Array.isArray(drvJson) ? drvJson : []);
        setStints(Array.isArray(stintJson) ? stintJson : []);
      })
      .catch((err) => {
        console.error("[RaceAnalysis] data fetch failed:", err);
        setErrorData("Couldn't load race data");
      })
      .finally(() => setLoadingData(false));
  }, [race]);

  // ── Build the chart-ready driver metadata once per drivers payload ──
  const driverMetas = useMemo(
    () =>
      drivers.map((d) => ({
        code: d.name_acronym,
        name: d.full_name,
        teamColor: `#${d.team_colour || "888888"}`,
        driverNumber: d.driver_number,
      })),
    [drivers],
  );

  // ── Highest lap number across all data — used as "totalLaps" axis cap ──
  const maxLap = useMemo(() => {
    let m = 0;
    for (const l of laps) {
      if (typeof l.lap_number === "number" && l.lap_number > m) m = l.lap_number;
    }
    for (const s of stints) {
      const end = s.lap_end ?? 0;
      if (end > m) m = end;
    }
    return m;
  }, [laps, stints]);

  // ── Race trace ──
  const trace = useMemo(() => buildRaceTrace(laps), [laps]);

  // ── Lap positions ──
  const positionsByLap = useMemo(
    () => buildLapPositions(positionEvents, laps),
    [positionEvents, laps],
  );

  // ── Tyre degradation curves (one per stint, fit per stint) ──
  const stintCurves = useMemo(() => {
    if (stints.length === 0 || laps.length === 0 || drivers.length === 0) return [];
    const driverByNumber = new Map<number, DriverData>();
    for (const d of drivers) driverByNumber.set(d.driver_number, d);
    const totalRaceLaps = maxLap > 0 ? maxLap : 1;

    const out: Array<{
      driverNumber: number;
      driverCode: string;
      teamColor: string;
      compound: Compound;
      stintNumber: number;
      curve: { tireAge: number; correctedLapTime: number }[];
      slope: number;
    }> = [];

    for (const stint of stints) {
      const driver = driverByNumber.get(stint.driver_number);
      if (!driver) continue;

      const stintEnd = stint.lap_end ?? maxLap;
      const stintLaps = laps.filter(
        (l) =>
          l.driver_number === stint.driver_number &&
          l.lap_number >= stint.lap_start &&
          l.lap_number <= stintEnd,
      );
      if (stintLaps.length === 0) continue;

      const curve = buildDegradationCurve(
        stintLaps,
        stint.lap_start,
        totalRaceLaps,
      );
      // Need a minimum number of points for a useful trend.
      if (curve.length < 5) continue;

      const slim = curve.map((c) => ({
        tireAge: c.tireAge,
        correctedLapTime: c.correctedLapTime,
      }));
      const fit = fitDegradationSlope(slim);

      out.push({
        driverNumber: stint.driver_number,
        driverCode: driver.name_acronym,
        teamColor: `#${driver.team_colour || "888888"}`,
        compound: normalizeCompound(stint.compound),
        stintNumber: stint.stint_number,
        curve: slim,
        slope: fit.slope,
      });
    }

    return out;
  }, [stints, laps, drivers, maxLap]);

  // ─── Render helpers ─────────────────────────────────────────────────

  const TABS: Array<{ id: AnalysisTab; label: string; icon: JSX.Element }> = [
    {
      id: "trace",
      label: "Race Trace",
      icon: <GitBranch className="w-3.5 h-3.5" />,
    },
    {
      id: "positions",
      label: "Lap Chart",
      icon: <ArrowUpDown className="w-3.5 h-3.5" />,
    },
    {
      id: "degradation",
      label: "Tyre Degradation",
      icon: <TrendingDown className="w-3.5 h-3.5" />,
    },
    {
      id: "sectors",
      label: "Sectors",
      icon: <Gauge className="w-3.5 h-3.5" />,
    },
  ];

  // Skeleton card while data loads
  function LoadingCard() {
    return (
      <div className="glass-card p-5 rounded-xl">
        <div className="relative h-[420px] sm:h-[460px] overflow-hidden rounded-lg bg-[var(--f1-hover)]">
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-f1-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-mono uppercase tracking-widest">
              Loading race data
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Error card
  function ErrorCard({ message }: { message: string }) {
    return (
      <div className="glass-card p-8 rounded-xl border border-racing-red/40 flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="w-7 h-7 text-racing-red" />
        <div className="text-sm font-mono text-racing-red">{message}</div>
        <button
          type="button"
          onClick={() => {
            // Re-trigger data fetch by toggling race ref.
            if (race) {
              const current = race;
              setRace(null);
              setTimeout(() => setRace(current), 0);
            }
          }}
          className="text-[10px] font-mono uppercase tracking-widest text-f1-muted hover:text-f1 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Insufficient-data card
  function InsufficientCard({ message }: { message: string }) {
    return (
      <div className="glass-card p-12 rounded-xl flex flex-col items-center gap-3 text-center">
        <Flag className="w-8 h-8 text-[var(--f1-text-dim)]" />
        <div className="text-sm text-f1-muted font-mono">{message}</div>
      </div>
    );
  }

  // ─── What goes inside the active tab ───────────────────────────────

  function renderTabContent() {
    if (!race) {
      return (
        <InsufficientCard message="Select a year and race to begin" />
      );
    }
    if (loadingData) {
      return <LoadingCard />;
    }
    if (errorData) {
      return <ErrorCard message={errorData} />;
    }
    // Race hasn't run yet / no data
    if (laps.length < 3) {
      return (
        <InsufficientCard
          message={
            laps.length === 0
              ? "No data for this session"
              : "Race hasn't started yet"
          }
        />
      );
    }

    if (tab === "trace") {
      return (
        <div className="glass-card p-3 sm:p-5 rounded-xl">
          <RaceTraceChart
            drivers={driverMetas}
            lapData={trace}
            totalLaps={maxLap || 1}
          />
        </div>
      );
    }

    if (tab === "positions") {
      return (
        <div className="glass-card p-3 sm:p-5 rounded-xl">
          <LapPositionChart
            drivers={driverMetas}
            positionsByLap={positionsByLap}
            totalLaps={maxLap || 1}
          />
        </div>
      );
    }

    if (tab === "degradation") {
      return (
        <div className="glass-card p-3 sm:p-5 rounded-xl">
          {stintCurves.length === 0 ? (
            <InsufficientCard message="Not enough stint data for degradation curves" />
          ) : (
            <TyreDegradationChart stints={stintCurves} />
          )}
        </div>
      );
    }

    // tab === "sectors" — F1 broadcast-style sector colors per driver
    return (
      <div className="glass-card p-3 sm:p-5 rounded-xl">
        {laps.length === 0 ? (
          <InsufficientCard message="No lap data available for sector analysis" />
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[40px_1fr_auto] gap-3 px-3 py-2 text-ferrari-micro text-f1-muted uppercase">
              <span>Pos</span>
              <span>Driver</span>
              <span>Sectors</span>
            </div>
            {driverMetas.map((d, i) => {
              const sectors = computeSectorColors(laps, d.driverNumber);
              return (
                <div
                  key={d.driverNumber}
                  className="grid grid-cols-[40px_1fr_auto] gap-3 px-3 py-2 rounded-ferrari-dialog hover:bg-[var(--f1-hover)] items-center"
                >
                  <span className="font-mono text-xs text-f1-muted tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-1 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: d.teamColor }}
                    />
                    <span
                      className="font-mono text-xs font-bold truncate"
                      style={{ color: d.teamColor }}
                    >
                      {d.code}
                    </span>
                    <span className="text-[10px] text-f1-muted truncate hidden sm:inline">
                      {d.name}
                    </span>
                  </div>
                  <SectorIndicators sectors={sectors} variant="full" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Activity className="w-5 sm:w-7 h-5 sm:h-7 text-racing-red flex-shrink-0" />
            Race Analysis
          </h1>
          <p className="text-xs sm:text-sm text-f1-muted mt-1">
            Race trace · lap chart · tyre degradation · sectors
          </p>
        </div>
      </div>

      {/* ── Race selector ── */}
      <RaceSelector
        year={year}
        setYear={setYear}
        sessionType={sessionType}
        setSessionType={setSessionType}
        races={races}
        loading={loadingRaces}
        selected={race}
        setSelected={setRace}
      />

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-0.5 sm:gap-1 bg-[var(--f1-hover)] border border-[var(--f1-border)] p-0.5 sm:p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap",
              tab === t.id
                ? "bg-[var(--f1-card)] text-f1 shadow-sm"
                : "text-f1-muted hover:text-f1-sub",
            )}
            aria-pressed={tab === t.id}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Active tab content ── */}
      {renderTabContent()}
    </div>
  );
}
