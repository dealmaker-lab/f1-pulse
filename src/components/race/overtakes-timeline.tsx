"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Loader2 } from "lucide-react";

interface OvertakeParty {
  number: number;
  code: string;
  teamColor: string;
}

interface Overtake {
  date: string;
  position: number;
  overtaker: OvertakeParty;
  overtaken: OvertakeParty;
}

interface Props {
  sessionKey: number;
  className?: string;
}

/**
 * Session overtakes as a chronological timeline: who passed whom, for which
 * position, when. Data comes from OpenF1's /v1/overtakes via our proxy.
 */
export default function OvertakesTimeline({ sessionKey, className }: Props) {
  const [overtakes, setOvertakes] = useState<Overtake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [driverFilter, setDriverFilter] = useState<string>("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setDriverFilter("");
    fetch(`/api/f1/overtakes?session_key=${sessionKey}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Upstream ${res.status}`);
        return res.json();
      })
      .then((data: Overtake[]) => {
        setOvertakes(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [sessionKey]);

  const sessionStart = useMemo(
    () => (overtakes.length ? new Date(overtakes[0].date).getTime() : 0),
    [overtakes],
  );

  const driverCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const o of overtakes) {
      codes.add(o.overtaker.code);
      codes.add(o.overtaken.code);
    }
    return Array.from(codes).sort();
  }, [overtakes]);

  const shown = useMemo(
    () =>
      driverFilter
        ? overtakes.filter(
            (o) =>
              o.overtaker.code === driverFilter ||
              o.overtaken.code === driverFilter,
          )
        : overtakes,
    [overtakes, driverFilter],
  );

  // Leaderboard of most active overtakers
  const topOvertakers = useMemo(() => {
    const counts = new Map<string, { code: string; teamColor: string; count: number }>();
    for (const o of overtakes) {
      const cur = counts.get(o.overtaker.code) ?? {
        code: o.overtaker.code,
        teamColor: o.overtaker.teamColor,
        count: 0,
      };
      cur.count += 1;
      counts.set(o.overtaker.code, cur);
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [overtakes]);

  if (loading) {
    return (
      <div className={`glass-card p-8 flex items-center justify-center ${className ?? ""}`}>
        <Loader2 className="w-5 h-5 animate-spin text-racing-red" />
        <span className="ml-3 text-sm text-f1-muted font-mono">
          Loading overtakes…
        </span>
      </div>
    );
  }

  if (error || overtakes.length === 0) {
    return (
      <div className={`glass-card p-8 text-center ${className ?? ""}`}>
        <p className="text-f1-muted text-sm">
          {error
            ? "Couldn't load overtake data for this session"
            : "No on-track overtakes recorded for this session"}
        </p>
      </div>
    );
  }

  return (
    <div className={`glass-card p-4 sm:p-5 space-y-4 ${className ?? ""}`}>
      {/* Header + top overtakers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-racing-red" />
          <span className="text-ferrari-label text-[11px]">
            Overtakes · {overtakes.length} total
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {topOvertakers.map((d) => (
            <button
              key={d.code}
              onClick={() =>
                setDriverFilter((cur) => (cur === d.code ? "" : d.code))
              }
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors ${
                driverFilter === d.code
                  ? "border-white/40 bg-white/10"
                  : "border-white/10 hover:border-white/25"
              }`}
              style={{ color: d.teamColor }}
              title={`${d.code}: ${d.count} overtakes — click to filter`}
            >
              {d.code} · {d.count}
            </button>
          ))}
          {driverFilter && (
            <button
              onClick={() => setDriverFilter("")}
              className="px-2 py-0.5 rounded text-[10px] font-mono text-f1-muted border border-white/10 hover:border-white/25"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Driver filter */}
      {driverCodes.length > 0 && (
        <select
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          className="bg-transparent border border-white/10 rounded px-2 py-1 text-xs font-mono text-f1"
          aria-label="Filter overtakes by driver"
        >
          <option value="">All drivers</option>
          {driverCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      )}

      {/* Timeline */}
      <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
        {shown.map((o, i) => {
          const elapsedMin = sessionStart
            ? Math.max(0, (new Date(o.date).getTime() - sessionStart) / 60000)
            : 0;
          return (
            <div
              key={`${o.date}-${o.overtaker.number}-${i}`}
              className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/[0.04] transition-colors"
            >
              <span className="w-14 flex-shrink-0 text-[10px] font-mono text-f1-muted text-right">
                +{elapsedMin.toFixed(0)}m
              </span>
              <span
                className="w-10 flex-shrink-0 text-xs font-mono font-bold"
                style={{ color: o.overtaker.teamColor }}
              >
                {o.overtaker.code}
              </span>
              <span className="text-f1-muted text-[10px] font-mono flex-shrink-0">
                passed
              </span>
              <span
                className="w-10 flex-shrink-0 text-xs font-mono font-bold"
                style={{ color: o.overtaken.teamColor }}
              >
                {o.overtaken.code}
              </span>
              <span className="ml-auto text-[10px] font-mono text-f1-sub flex-shrink-0">
                for P{o.position}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
