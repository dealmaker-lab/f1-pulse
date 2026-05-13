"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Radio, AlertTriangle, Shield, Zap } from "lucide-react";
import { CURRENT_YEAR } from "@/lib/constants";

/**
 * LiveLeaderboardPip — the widget rendered INSIDE a Document Picture-in-Picture
 * window. Always-on-top of other windows, this gives the user a glanceable
 * view of the live race while they work elsewhere.
 *
 * Data flow:
 *  1. On mount, fetch `/api/f1/sessions?year=CURRENT_YEAR` (proxied to OpenF1)
 *     and pick the session whose `[date_start, date_end]` straddles "now".
 *  2. If we found one, poll positions / intervals / drivers / race-control
 *     every 3s. If we didn't, show "No live session" + the next race's date.
 *  3. Render the top 8 positions as a compact row layout with team-color
 *     rails. Show the latest race-control message in a single scrolling
 *     line at the bottom.
 *
 * Styling note:
 *  Tailwind classes are mirrored into the PiP window by `useDocumentPip`, but
 *  we also inline the most critical layout rules (flex columns, sizing) so the
 *  widget is legible even during the brief moment before the cloned `<style>`
 *  tags parse.
 */

interface SessionInfo {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_short_name: string;
  country_name: string;
  year: number;
}

interface DriverInfo {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string;
}

interface PositionEntry {
  date: string;
  driver_number: number;
  position: number;
}

interface IntervalEntry {
  date: string;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

interface RaceControlEntry {
  date: string;
  message: string;
  flag?: string | null;
  category?: string | null;
}

type FlagState = "GREEN" | "YELLOW" | "RED" | "SC" | "VSC" | "CHEQUERED" | null;

interface LeaderboardRow {
  position: number;
  driver: DriverInfo;
  gapToLeader: number | null;
  isLeader: boolean;
}

const POLL_INTERVAL_MS = 3000;

/**
 * Pull a numeric gap out of OpenF1's interval payload. The upstream field can
 * be `null`, a number, or — for the race leader — the string "+1 LAP".
 */
function parseGap(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // "+1 LAP" / "+2 LAPS" cannot be reduced to seconds — show as null and
    // let the row render "+LAP" via the isLapDown heuristic below.
    if (/lap/i.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isLapDown(value: number | string | null): boolean {
  return typeof value === "string" && /lap/i.test(value);
}

/**
 * Pick the active session for "now": its `date_start <= now <= date_end`. If
 * none, return null and let the caller render the empty state.
 */
function findLiveSession(sessions: SessionInfo[], now: number): SessionInfo | null {
  for (const s of sessions) {
    const start = new Date(s.date_start).getTime();
    const end = new Date(s.date_end).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && start <= now && now <= end) {
      return s;
    }
  }
  return null;
}

function findNextSession(sessions: SessionInfo[], now: number): SessionInfo | null {
  let best: SessionInfo | null = null;
  let bestStart = Infinity;
  for (const s of sessions) {
    const start = new Date(s.date_start).getTime();
    if (Number.isFinite(start) && start > now && start < bestStart) {
      bestStart = start;
      best = s;
    }
  }
  return best;
}

/**
 * Compress a race control message to a flag state. Mirrors the heuristics
 * used by `live-status-banner.tsx` but operates on OpenF1's REST shape (which
 * is a flat list of strings) instead of the SignalR `TrackStatus` payload.
 */
function deriveFlagFromRaceControl(messages: RaceControlEntry[]): FlagState {
  if (!messages.length) return null;
  const latest = messages[messages.length - 1];
  const flag = (latest.flag ?? "").toUpperCase();
  if (flag === "RED") return "RED";
  if (flag === "YELLOW" || flag === "DOUBLE YELLOW") return "YELLOW";
  if (flag === "GREEN" || flag === "CLEAR") return "GREEN";
  if (flag === "CHEQUERED") return "CHEQUERED";
  const msg = (latest.message ?? "").toLowerCase();
  if (msg.includes("virtual safety")) return "VSC";
  if (msg.includes("safety car")) return "SC";
  if (msg.includes("red flag")) return "RED";
  if (msg.includes("yellow")) return "YELLOW";
  if (msg.includes("chequered")) return "CHEQUERED";
  if (msg.includes("green") || msg.includes("clear")) return "GREEN";
  return null;
}

const FLAG_META: Record<
  Exclude<FlagState, null>,
  {
    label: string;
    bg: string;
    text: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  GREEN: { label: "GREEN", bg: "bg-emerald-500/20", text: "text-emerald-300", icon: Flag },
  YELLOW: { label: "YELLOW", bg: "bg-amber-500/20", text: "text-amber-300", icon: AlertTriangle },
  RED: { label: "RED FLAG", bg: "bg-red-500/25", text: "text-red-300", icon: Flag },
  SC: { label: "SAFETY CAR", bg: "bg-orange-500/20", text: "text-orange-300", icon: Shield },
  VSC: { label: "VSC", bg: "bg-yellow-500/20", text: "text-yellow-300", icon: Zap },
  CHEQUERED: { label: "CHEQUERED", bg: "bg-zinc-500/25", text: "text-zinc-200", icon: Flag },
};

function formatGap(value: number | null, fallback: string | null): string {
  if (value === null) return fallback ?? "";
  if (value <= 0) return "";
  return `+${value.toFixed(value < 10 ? 3 : 1)}s`;
}

function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return "starting";
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 60) return `in ${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 48) return `in ${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

export function LiveLeaderboardPip(): JSX.Element {
  // Use a refresh "tick" so we re-evaluate the live session every minute even
  // if the session list itself hasn't changed.
  const [now, setNow] = useState<number>(() => Date.now());
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Per-poll state — only populated while a live session is active.
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [positions, setPositions] = useState<PositionEntry[]>([]);
  const [intervals, setIntervals] = useState<IntervalEntry[]>([]);
  const [raceControl, setRaceControl] = useState<RaceControlEntry[]>([]);
  const lastRaceControlMsgRef = useRef<string>("");

  // ===== Re-tick `now` every 30s so the "live session?" check stays fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // ===== Fetch the season's sessions ONCE at mount; refresh hourly.
  useEffect(() => {
    let cancelled = false;
    const loadSessions = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/f1/sessions?year=${CURRENT_YEAR}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`sessions ${res.status}`);
        const data: unknown = await res.json();
        if (cancelled) return;
        setSessions(Array.isArray(data) ? (data as SessionInfo[]) : []);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setSessionsLoaded(true);
      }
    };
    loadSessions();
    const id = window.setInterval(loadSessions, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const liveSession = useMemo(
    () => findLiveSession(sessions, now),
    [sessions, now],
  );
  const nextSession = useMemo(
    () => (liveSession ? null : findNextSession(sessions, now)),
    [sessions, now, liveSession],
  );

  // ===== Poll the live data sources at 3s while a session is live.
  useEffect(() => {
    if (!liveSession) {
      setDrivers([]);
      setPositions([]);
      setIntervals([]);
      setRaceControl([]);
      return;
    }
    const sk = liveSession.session_key;
    const ctrl = new AbortController();
    let timer: number | null = null;

    const poll = async (): Promise<void> => {
      try {
        // Drivers change rarely — refetch each tick anyway because OpenF1
        // returns near-empty arrays at the very start of a session. Cheap
        // enough at session-key cardinality.
        const [drvRes, posRes, intRes, rcRes] = await Promise.all([
          fetch(`/api/f1/drivers?session_key=${sk}`, {
            cache: "no-store",
            signal: ctrl.signal,
          }),
          fetch(`/api/f1/positions?session_key=${sk}`, {
            cache: "no-store",
            signal: ctrl.signal,
          }),
          fetch(`/api/f1/intervals?session_key=${sk}`, {
            cache: "no-store",
            signal: ctrl.signal,
          }),
          fetch(`/api/f1/race-control?session_key=${sk}`, {
            cache: "no-store",
            signal: ctrl.signal,
          }).catch(() => null),
        ]);
        if (ctrl.signal.aborted) return;
        const drvJson: unknown = await drvRes.json();
        const posJson: unknown = await posRes.json();
        const intJson: unknown = await intRes.json();
        const rcJson: unknown = rcRes ? await rcRes.json() : [];
        if (ctrl.signal.aborted) return;
        if (Array.isArray(drvJson)) setDrivers(drvJson as DriverInfo[]);
        if (Array.isArray(posJson)) setPositions(posJson as PositionEntry[]);
        if (Array.isArray(intJson)) setIntervals(intJson as IntervalEntry[]);
        if (Array.isArray(rcJson)) setRaceControl(rcJson as RaceControlEntry[]);
      } catch {
        // Network blip — let the next tick retry. Silently swallow because
        // the PiP window has no place to display an error toast.
      } finally {
        if (!ctrl.signal.aborted) {
          timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };
    poll();
    return () => {
      ctrl.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [liveSession]);

  // ===== Build the top-8 leaderboard from the latest position per driver.
  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    if (!drivers.length) return [];

    // Latest position per driver (positions endpoint returns history; we
    // want the most recent entry per driver).
    const latestPosByDriver = new Map<number, PositionEntry>();
    for (const p of positions) {
      const prev = latestPosByDriver.get(p.driver_number);
      if (!prev || p.date > prev.date) latestPosByDriver.set(p.driver_number, p);
    }
    // Latest interval per driver.
    const latestIntByDriver = new Map<number, IntervalEntry>();
    for (const iv of intervals) {
      const prev = latestIntByDriver.get(iv.driver_number);
      if (!prev || iv.date > prev.date) latestIntByDriver.set(iv.driver_number, iv);
    }

    const rows: LeaderboardRow[] = drivers.map((d) => {
      const pos = latestPosByDriver.get(d.driver_number)?.position ?? 99;
      const ivRaw = latestIntByDriver.get(d.driver_number);
      const gap = parseGap(ivRaw?.gap_to_leader ?? null);
      // Heuristic: if the leader's own row has a gap_to_leader, OpenF1 is
      // using "0" — we still want to label that row as LEADER.
      return {
        position: pos,
        driver: d,
        gapToLeader: gap,
        isLeader: pos === 1,
      };
    });
    rows.sort((a, b) => a.position - b.position);
    return rows.filter((r) => r.position > 0 && r.position <= 20).slice(0, 8);
  }, [drivers, positions, intervals]);

  // Flag state derived from the latest race-control entry.
  const flag = useMemo(() => deriveFlagFromRaceControl(raceControl), [raceControl]);

  // Latest race-control message (string) for the marquee.
  const latestRcMessage = useMemo<string>(() => {
    if (!raceControl.length) return "";
    const latest = raceControl[raceControl.length - 1];
    return (latest.message ?? "").trim();
  }, [raceControl]);

  // Track whether the message changed — used to restart the marquee animation.
  const [marqueeKey, setMarqueeKey] = useState(0);
  useEffect(() => {
    if (latestRcMessage && latestRcMessage !== lastRaceControlMsgRef.current) {
      lastRaceControlMsgRef.current = latestRcMessage;
      setMarqueeKey((k) => k + 1);
    }
  }, [latestRcMessage]);

  // ===== Render =====
  if (!sessionsLoaded) {
    return (
      <div className="flex h-full w-full flex-1 items-center justify-center bg-black text-white">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Loading…
        </div>
      </div>
    );
  }

  if (!liveSession) {
    const nextStart = nextSession ? new Date(nextSession.date_start).getTime() : null;
    return (
      <div
        className="flex h-full w-full flex-1 flex-col items-stretch justify-between bg-black p-3 text-white"
        style={{ minHeight: "100vh" }}
      >
        <header className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3 w-3" aria-hidden />
            F1 Pulse
          </span>
          <span className="text-zinc-600">offline</span>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Flag className="h-6 w-6 text-zinc-700" aria-hidden />
          <div className="text-sm font-semibold text-zinc-200">No live session</div>
          {nextSession && nextStart !== null && (
            <div className="text-[11px] font-mono text-zinc-500">
              Next: {nextSession.session_name} ·{" "}
              <span className="text-zinc-300">
                {formatCountdown(nextStart, now)}
              </span>
            </div>
          )}
          {nextSession && (
            <div className="text-[10px] text-zinc-600">
              {nextSession.circuit_short_name}, {nextSession.country_name}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-1 flex-col bg-black text-white"
      style={{ minHeight: "100vh" }}
    >
      {/* Header: live pill + flag chip */}
      <header className="flex items-center gap-1.5 border-b border-zinc-900 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-300 ring-1 ring-red-500/40">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
          </span>
          LIVE
        </span>
        <span className="truncate text-[10px] font-mono uppercase tracking-wide text-zinc-400">
          {liveSession.session_name} · {liveSession.circuit_short_name}
        </span>
        {flag && (
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${FLAG_META[flag].bg} ${FLAG_META[flag].text}`}
          >
            {(() => {
              const Icon = FLAG_META[flag].icon;
              return <Icon className="h-2.5 w-2.5" aria-hidden />;
            })()}
            {FLAG_META[flag].label}
          </span>
        )}
      </header>

      {/* Leaderboard rows */}
      <ul className="flex-1 divide-y divide-zinc-900/80 overflow-hidden" role="list">
        {leaderboard.length === 0 ? (
          <li className="flex h-full items-center justify-center px-3 py-6 text-[11px] font-mono text-zinc-500">
            Waiting for timing data…
          </li>
        ) : (
          leaderboard.map((row) => {
            const color = `#${row.driver.team_colour || "888888"}`;
            const ivRaw = intervals.find(
              (iv) => iv.driver_number === row.driver.driver_number,
            );
            const lapped = ivRaw ? isLapDown(ivRaw.gap_to_leader) : false;
            return (
              <li
                key={row.driver.driver_number}
                className="flex items-center gap-2 px-3 py-1"
                style={{ minHeight: 28 }}
              >
                <span
                  className="w-5 text-right font-mono text-[11px] font-bold tabular-nums text-zinc-400"
                  aria-label={`Position ${row.position}`}
                >
                  P{row.position}
                </span>
                <span
                  aria-hidden
                  style={{
                    backgroundColor: color,
                    width: 2,
                    height: 16,
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="font-mono text-[12px] font-bold"
                  style={{ color, minWidth: 38 }}
                >
                  {row.driver.name_acronym}
                </span>
                <span className="flex-1" />
                {row.isLeader ? (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    LEADER
                    {flag && row.isLeader && (
                      <span
                        className={`ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${FLAG_META[flag].bg}`}
                        aria-hidden
                      />
                    )}
                  </span>
                ) : lapped ? (
                  <span className="font-mono text-[10px] text-zinc-500">+LAP</span>
                ) : (
                  <span className="font-mono text-[10px] tabular-nums text-zinc-300">
                    {formatGap(row.gapToLeader, "–")}
                  </span>
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* Race control ticker */}
      <footer className="border-t border-zinc-900 px-3 py-1.5">
        {latestRcMessage ? (
          <div
            className="relative overflow-hidden whitespace-nowrap text-[10px] font-mono text-zinc-300"
            style={{ height: 14 }}
          >
            <div
              key={marqueeKey}
              className="inline-block"
              style={{
                paddingLeft: "100%",
                animation: "f1pulse-pip-marquee 18s linear infinite",
              }}
            >
              <span className="text-zinc-500">RC:&nbsp;</span>
              {latestRcMessage}
            </div>
            <style>{`@keyframes f1pulse-pip-marquee { from { transform: translateX(0%); } to { transform: translateX(-100%); } }`}</style>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-zinc-600">No race control messages yet</div>
        )}
        <div className="mt-0.5 flex items-center justify-between text-[8px] font-mono uppercase tracking-wider text-zinc-700">
          <span>updated every 3s</span>
          <span className="text-zinc-500">F1 Pulse</span>
        </div>
      </footer>
    </div>
  );
}

export type { LeaderboardRow };
