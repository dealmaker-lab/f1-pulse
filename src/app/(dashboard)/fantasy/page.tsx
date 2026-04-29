"use client";

/**
 * Fantasy F1 page.
 *
 * Three tabs:
 *   • Lineup       — pick 5 drivers + 1 constructor under $100M, save it.
 *   • Driver of the Day — vote and watch live tallies.
 *   • Leaderboard  — top 100 scored lineups for the selected race.
 *
 * Race selection is a (year, round) pair. We default to CURRENT_YEAR / round 1
 * and let the user pick — we don't try to auto-detect "the next race" because
 * Jolpica's `/current/next` is sometimes stale right after a race.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Trophy, Star, Wallet, Users, Gauge, Loader2, Save, Vote,
  AlertCircle, CheckCircle2, ListOrdered,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { CURRENT_YEAR } from "@/lib/constants";
import {
  FANTASY_BUDGET_M,
  FANTASY_DRIVERS_COUNT,
  DEFAULT_2026_DRIVER_PRICES,
  DEFAULT_2026_CONSTRUCTOR_PRICES,
  getDriverPrice,
  getConstructorPrice,
} from "@/lib/fantasy";
import { DRIVER_FALLBACK } from "@/lib/team-logos";

// ─── Driver / constructor catalog (UI-side) ─────────────────────────────

interface DriverEntry {
  code: string;
  name: string;
  team: string;
  price: number;
}

interface ConstructorEntry {
  name: string;
  price: number;
}

/** Build the driver list from DRIVER_FALLBACK (number→info map). */
function buildDriverList(): DriverEntry[] {
  const seen = new Set<string>();
  const out: DriverEntry[] = [];
  for (const info of Object.values(DRIVER_FALLBACK)) {
    if (seen.has(info.code)) continue;
    // Only include drivers with a default 2026 price — these are the
    // ones on the actual 2026 grid.
    if (!(info.code in DEFAULT_2026_DRIVER_PRICES)) continue;
    seen.add(info.code);
    out.push({
      code: info.code,
      name: info.name,
      team: info.team,
      price: DEFAULT_2026_DRIVER_PRICES[info.code],
    });
  }
  // Sort by price desc → top tier first.
  return out.sort((a, b) => b.price - a.price);
}

function buildConstructorList(): ConstructorEntry[] {
  return Object.entries(DEFAULT_2026_CONSTRUCTOR_PRICES)
    .map(([name, price]) => ({ name, price }))
    .sort((a, b) => b.price - a.price);
}

const DRIVERS = buildDriverList();
const CONSTRUCTORS = buildConstructorList();

// ─── Race selector helpers ──────────────────────────────────────────────

const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1];
const ROUNDS = Array.from({ length: 24 }, (_, i) => i + 1);

// ─── Tab type ───────────────────────────────────────────────────────────

type Tab = "lineup" | "dotd" | "leaderboard";

// ─── Page ───────────────────────────────────────────────────────────────

export default function FantasyPage() {
  const { isSignedIn } = useAuth();
  const [tab, setTab] = useState<Tab>("lineup");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [round, setRound] = useState<number>(1);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-f1-text flex items-center gap-2">
            <Trophy className="w-6 h-6 text-racing-red" />
            Fantasy F1
          </h1>
          <p className="text-sm text-f1-muted mt-1">
            Pick 5 drivers + 1 constructor under ${FANTASY_BUDGET_M}M. Score against the real race.
          </p>
        </div>

        {/* Race selector */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
            Race
          </label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="bg-[var(--f1-card)] border border-white/10 rounded-md px-2 py-1.5 text-sm text-f1-text focus:outline-none focus:border-racing-red/40"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={round}
            onChange={(e) => setRound(parseInt(e.target.value, 10))}
            className="bg-[var(--f1-card)] border border-white/10 rounded-md px-2 py-1.5 text-sm text-f1-text focus:outline-none focus:border-racing-red/40"
          >
            {ROUNDS.map((r) => (
              <option key={r} value={r}>Round {r}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <TabButton active={tab === "lineup"} onClick={() => setTab("lineup")} icon={Wallet} label="Lineup" />
        <TabButton active={tab === "dotd"} onClick={() => setTab("dotd")} icon={Star} label="Driver of the Day" />
        <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} icon={ListOrdered} label="Leaderboard" />
      </div>

      {/* Body */}
      {tab === "lineup" && (
        <LineupBuilder year={year} round={round} isSignedIn={!!isSignedIn} />
      )}
      {tab === "dotd" && (
        <DotdPanel year={year} round={round} isSignedIn={!!isSignedIn} />
      )}
      {tab === "leaderboard" && (
        <LeaderboardPanel year={year} round={round} />
      )}
    </div>
  );
}

// ─── Tab button ─────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer",
        active
          ? "border-racing-red text-f1-text"
          : "border-transparent text-f1-muted hover:text-f1-text",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ─── Lineup builder ─────────────────────────────────────────────────────

interface SavedLineup {
  drivers: string[];
  constructor: string;
  budget_used: number;
  score: number | null;
}

function LineupBuilder({
  year, round, isSignedIn,
}: { year: number; round: number; isSignedIn: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [team, setTeam] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savedLineup, setSavedLineup] = useState<SavedLineup | null>(null);

  // Load existing lineup for this race.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    fetch(`/api/fantasy/lineup?year=${year}&round=${round}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        if (d?.lineup) {
          setPicked(d.lineup.drivers ?? []);
          setTeam(d.lineup.constructor ?? null);
          setSavedLineup({
            drivers: d.lineup.drivers ?? [],
            constructor: d.lineup.constructor ?? "",
            budget_used: parseFloat(d.lineup.budget_used) || 0,
            score: d.lineup.score == null ? null : parseFloat(d.lineup.score),
          });
        } else {
          setPicked([]);
          setTeam(null);
          setSavedLineup(null);
        }
      })
      .catch((e) => !cancelled && setError(e.message || "Failed to load lineup"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [year, round, isSignedIn]);

  const budgetUsed = useMemo(() => {
    const d = picked.reduce((s, c) => s + getDriverPrice(c), 0);
    const t = team ? getConstructorPrice(team) : 0;
    return Math.round((d + t) * 100) / 100;
  }, [picked, team]);

  const overBudget = budgetUsed > FANTASY_BUDGET_M;
  const fullDrivers = picked.length === FANTASY_DRIVERS_COUNT;
  const valid = isSignedIn && fullDrivers && team !== null && !overBudget;

  function toggleDriver(code: string) {
    setSuccess(null);
    setError(null);
    setPicked((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= FANTASY_DRIVERS_COUNT) return prev; // ignore extras
      return [...prev, code];
    });
  }

  function pickTeam(name: string) {
    setSuccess(null);
    setError(null);
    setTeam((cur) => (cur === name ? null : name));
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/fantasy/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year, round,
          drivers: picked,
          constructor: team,
          budget_used: budgetUsed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setSavedLineup({
        drivers: json.lineup?.drivers ?? picked,
        constructor: json.lineup?.constructor ?? (team as string),
        budget_used: parseFloat(json.lineup?.budget_used) || budgetUsed,
        score: json.lineup?.score == null ? null : parseFloat(json.lineup.score),
      });
      setSuccess("Lineup saved!");
    } catch (e) {
      setError((e as Error).message || "Failed to save lineup");
    } finally {
      setSaving(false);
    }
  }

  if (!isSignedIn) {
    return (
      <div className="p-6 rounded-lg border border-white/10 bg-[var(--f1-card)] text-center text-f1-muted">
        Sign in to build your fantasy lineup.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Budget bar */}
      <div className="rounded-lg border border-white/10 bg-[var(--f1-card)] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
            <Wallet className="w-3.5 h-3.5" /> Budget
          </div>
          <div
            className={cn(
              "font-mono font-bold text-lg tabular-nums",
              overBudget ? "text-racing-red" : "text-f1-text",
            )}
          >
            ${budgetUsed.toFixed(1)}M / ${FANTASY_BUDGET_M}M
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500 rounded-full",
              overBudget ? "bg-racing-red" : "bg-emerald-500",
            )}
            style={{ width: `${Math.min(100, (budgetUsed / FANTASY_BUDGET_M) * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-f1-muted">
          <span>{picked.length} / {FANTASY_DRIVERS_COUNT} drivers</span>
          <span>{team ? "1" : "0"} / 1 constructor</span>
        </div>
      </div>

      {/* Saved lineup banner */}
      {savedLineup && !loading && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-f1-text">
            Lineup saved for {year} R{round}.{" "}
            {savedLineup.score == null
              ? "Race not scored yet."
              : <span>Current score: <strong className="font-mono">{savedLineup.score.toFixed(2)}</strong></span>
            }
          </div>
        </div>
      )}

      {/* Drivers */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          <Users className="w-3.5 h-3.5" /> Drivers ({picked.length}/{FANTASY_DRIVERS_COUNT})
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {DRIVERS.map((d) => {
            const selected = picked.includes(d.code);
            const disabled = !selected && picked.length >= FANTASY_DRIVERS_COUNT;
            return (
              <button
                key={d.code}
                onClick={() => toggleDriver(d.code)}
                disabled={disabled}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-all cursor-pointer",
                  selected
                    ? "border-racing-red/60 bg-racing-red/[0.08] shadow-[inset_0_0_0_1px_rgba(225,6,0,0.3)]"
                    : "border-white/10 bg-[var(--f1-card)] hover:border-white/25",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <div className="min-w-0">
                  <div className="font-mono font-bold text-sm text-f1-text">{d.code}</div>
                  <div className="text-[10px] text-f1-muted truncate">{d.team}</div>
                </div>
                <div className={cn(
                  "font-mono text-xs tabular-nums",
                  selected ? "text-racing-red font-bold" : "text-f1-muted",
                )}>
                  ${d.price.toFixed(1)}M
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Constructors */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          <Gauge className="w-3.5 h-3.5" /> Constructor ({team ? 1 : 0}/1)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {CONSTRUCTORS.map((c) => {
            const selected = team === c.name;
            return (
              <button
                key={c.name}
                onClick={() => pickTeam(c.name)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-all cursor-pointer",
                  selected
                    ? "border-racing-red/60 bg-racing-red/[0.08]"
                    : "border-white/10 bg-[var(--f1-card)] hover:border-white/25",
                )}
              >
                <div className="text-sm font-semibold text-f1-text truncate">{c.name}</div>
                <div className={cn(
                  "font-mono text-xs tabular-nums flex-shrink-0",
                  selected ? "text-racing-red font-bold" : "text-f1-muted",
                )}>
                  ${c.price.toFixed(1)}M
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Save bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-[var(--f1-card)] p-3">
        <div className="text-xs text-f1-muted">
          {!fullDrivers && <span>Pick {FANTASY_DRIVERS_COUNT - picked.length} more driver{(FANTASY_DRIVERS_COUNT - picked.length) === 1 ? "" : "s"}.</span>}
          {fullDrivers && !team && <span>Pick a constructor.</span>}
          {fullDrivers && team && overBudget && <span className="text-racing-red">Over budget by ${(budgetUsed - FANTASY_BUDGET_M).toFixed(1)}M.</span>}
          {valid && <span>Ready to lock in.</span>}
        </div>
        <button
          onClick={save}
          disabled={!valid || saving}
          className={cn(
            "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md font-semibold text-sm transition-all",
            valid
              ? "bg-racing-red text-white hover:bg-racing-red/90 cursor-pointer"
              : "bg-white/[0.05] text-f1-muted cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Lineup
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-racing-red/30 bg-racing-red/[0.06] p-3 text-xs text-racing-red flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {success && !error && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-xs text-emerald-500 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {success}
        </div>
      )}
    </div>
  );
}

// ─── DOTD ───────────────────────────────────────────────────────────────

function DotdPanel({
  year, round, isSignedIn,
}: { year: number; round: number; isSignedIn: boolean }) {
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useMemo(() => () => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dotd/vote?year=${year}&round=${round}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.error) {
          setError(d.error);
        } else {
          setTallies(d.tallies ?? {});
          setTotal(d.total ?? 0);
          setMyVote(d.my_vote ?? null);
          if (d.my_vote) setPicked(d.my_vote);
        }
      })
      .catch((e) => !cancelled && setError(e.message || "Failed to load votes"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [year, round]);

  useEffect(() => {
    const cleanup = refresh();
    return cleanup;
  }, [refresh]);

  async function vote() {
    if (!picked || !isSignedIn) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dotd/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, round, driver_code: picked }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setMyVote(picked);
      // Refresh tallies after vote.
      refresh();
    } catch (e) {
      setError((e as Error).message || "Vote failed");
    } finally {
      setSubmitting(false);
    }
  }

  const showTallies = myVote !== null;
  const maxTally = Math.max(1, ...Object.values(tallies));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[var(--f1-card)] p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-f1-muted font-semibold mb-3">
          <Star className="w-3.5 h-3.5" /> Driver of the Day — {year} Round {round}
        </div>

        {!isSignedIn ? (
          <p className="text-sm text-f1-muted">Sign in to cast your vote.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-3">
              {DRIVERS.map((d) => {
                const selected = picked === d.code;
                return (
                  <label
                    key={d.code}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-all",
                      selected
                        ? "border-racing-red/60 bg-racing-red/[0.08]"
                        : "border-white/10 bg-[var(--f1-card)] hover:border-white/25",
                    )}
                  >
                    <input
                      type="radio"
                      name="dotd"
                      checked={selected}
                      onChange={() => setPicked(d.code)}
                      className="accent-racing-red"
                    />
                    <span className="font-mono font-bold text-sm text-f1-text">{d.code}</span>
                    <span className="text-[10px] text-f1-muted truncate">{d.team}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-xs text-f1-muted">
                {myVote
                  ? <>You voted <strong className="font-mono text-f1-text">{myVote}</strong>. You can change your pick.</>
                  : <>Pick a driver, then vote.</>
                }
              </div>
              <button
                onClick={vote}
                disabled={!picked || submitting}
                className={cn(
                  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md font-semibold text-sm transition-all",
                  picked
                    ? "bg-racing-red text-white hover:bg-racing-red/90 cursor-pointer"
                    : "bg-white/[0.05] text-f1-muted cursor-not-allowed",
                )}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Vote className="w-4 h-4" />}
                {myVote ? "Change vote" : "Vote"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tallies */}
      {showTallies && (
        <div className="rounded-lg border border-white/10 bg-[var(--f1-card)] p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
              Live tallies
            </div>
            <div className="text-xs text-f1-muted">{total} vote{total === 1 ? "" : "s"}</div>
          </div>
          {loading && Object.keys(tallies).length === 0 ? (
            <div className="text-xs text-f1-muted flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          ) : Object.keys(tallies).length === 0 ? (
            <div className="text-xs text-f1-muted">No votes yet — be the first.</div>
          ) : (
            Object.entries(tallies)
              .sort(([, a], [, b]) => b - a)
              .map(([code, count]) => {
                const pct = (count / maxTally) * 100;
                const totalPct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={code} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-f1-text">{code}</span>
                      <span className="text-f1-muted tabular-nums">
                        {count} ({totalPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full bg-racing-red transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-racing-red/30 bg-racing-red/[0.06] p-3 text-xs text-racing-red flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard ────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  display: string;
  score: number;
  drivers: string[];
  constructor: string;
  budget_used: number;
}

function LeaderboardPanel({ year, round }: { year: number; round: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/fantasy/leaderboard?year=${year}&round=${round}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.error) setError(d.error);
        else setEntries(d.entries ?? []);
      })
      .catch((e) => !cancelled && setError(e.message || "Failed to load leaderboard"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [year, round]);

  return (
    <div className="rounded-lg border border-white/10 bg-[var(--f1-card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-f1-muted font-semibold">
          <ListOrdered className="w-3.5 h-3.5" /> Top Lineups — {year} Round {round}
        </div>
        <div className="text-xs text-f1-muted">{entries.length} entr{entries.length === 1 ? "y" : "ies"}</div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-f1-muted flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading leaderboard…
        </div>
      ) : error ? (
        <div className="p-4 text-xs text-racing-red flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-sm text-f1-muted">
          No scored lineups yet for this race. Lineups appear here after the race is scored.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-widest text-f1-muted">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-left">Drivers</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">Constructor</th>
                <th className="px-4 py-2 text-right hidden sm:table-cell">Budget</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.rank}-${e.display}`} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-f1-muted">{e.rank}</td>
                  <td className="px-4 py-2 font-mono text-f1-text">{e.display}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold tabular-nums text-racing-red">
                    {e.score.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-f1-text">
                    {e.drivers.join(" · ")}
                  </td>
                  <td className="px-4 py-2 text-xs text-f1-muted hidden sm:table-cell">{e.constructor}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-f1-muted hidden sm:table-cell tabular-nums">
                    ${e.budget_used.toFixed(1)}M
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
