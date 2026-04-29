/**
 * Admin: score every lineup for a race.
 *
 *   POST /api/fantasy/score?year=2026&round=5
 *     Headers: Authorization: Bearer $FANTASY_ADMIN_TOKEN
 *     → fetches Jolpica race results, runs `scoreLineup` on every
 *       row in `fantasy_lineups` for that race, and writes the score.
 *
 * Why an env-token instead of Clerk admin role? Clerk roles aren't wired
 * up in this app yet, and this endpoint is meant for a cron job / manual
 * curl after a race finishes. A simple bearer token keeps the surface tiny.
 */

import { NextRequest, NextResponse } from "next/server";
import { JOLPICA_BASE } from "@/lib/jolpica";
import { getServiceClient } from "@/lib/supabase";
import { scoreLineup, type FantasyResultRow } from "@/lib/fantasy";

interface JolpicaResult {
  position: string;
  status: string;
  Driver?: { code?: string; familyName?: string };
  Constructor?: { name?: string };
  FastestLap?: { rank?: string };
}

export async function POST(req: NextRequest) {
  // ─── Auth ─────────────────────────────────────────────────────────
  const adminToken = process.env.FANTASY_ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { error: "FANTASY_ADMIN_TOKEN not configured" },
      { status: 500 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented !== adminToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── Params ───────────────────────────────────────────────────────
  const yearStr = req.nextUrl.searchParams.get("year");
  const roundStr = req.nextUrl.searchParams.get("round");
  const year = yearStr ? parseInt(yearStr, 10) : NaN;
  const round = roundStr ? parseInt(roundStr, 10) : NaN;
  if (!Number.isFinite(year) || !Number.isFinite(round)) {
    return NextResponse.json(
      { error: "year and round query params required" },
      { status: 400 },
    );
  }

  try {
    // ─── Fetch race results from Jolpica ────────────────────────────
    const url = `${JOLPICA_BASE}/${year}/${round}/results.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Jolpica fetch failed: ${res.status}` },
        { status: 502 },
      );
    }
    const json = await res.json();
    const races = json?.MRData?.RaceTable?.Races ?? [];
    if (!races.length) {
      return NextResponse.json(
        { error: "No results available for that race yet" },
        { status: 404 },
      );
    }
    const raw: JolpicaResult[] = races[0].Results ?? [];
    if (!raw.length) {
      return NextResponse.json({ error: "Empty Results array" }, { status: 404 });
    }

    const results: FantasyResultRow[] = raw.map((r) => {
      const code =
        r.Driver?.code ||
        r.Driver?.familyName?.substring(0, 3).toUpperCase() ||
        "???";
      const posNum = parseInt(r.position, 10);
      return {
        code,
        team: r.Constructor?.name ?? "",
        position: Number.isFinite(posNum) ? posNum : null,
        fastestLap: r.FastestLap?.rank === "1",
        status: r.status ?? "",
      };
    });

    // ─── Score every lineup for that race ───────────────────────────
    const supabase = getServiceClient();
    const { data: lineups, error: fetchErr } = await supabase
      .from("fantasy_lineups")
      .select("id, drivers, constructor")
      .eq("year", year)
      .eq("round", round);

    if (fetchErr) {
      console.error("[fantasy/score] fetch lineups", fetchErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!lineups || lineups.length === 0) {
      return NextResponse.json({
        scored: 0,
        message: "No lineups to score for that race",
      });
    }

    // Update one row at a time — Postgres has no native bulk upsert with
    // distinct values per row, and N is bounded by # of users (small).
    let scored = 0;
    const errors: string[] = [];
    const nowIso = new Date().toISOString();
    for (const l of lineups) {
      const score = scoreLineup({
        drivers: (l.drivers as string[]) ?? [],
        constructor: (l.constructor as string) ?? "",
        results,
      });
      const { error: updateErr } = await supabase
        .from("fantasy_lineups")
        .update({ score, updated_at: nowIso })
        .eq("id", l.id);
      if (updateErr) {
        errors.push(`id=${l.id}: ${updateErr.message}`);
      } else {
        scored++;
      }
    }

    return NextResponse.json({
      year,
      round,
      scored,
      total: lineups.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("[fantasy/score]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
