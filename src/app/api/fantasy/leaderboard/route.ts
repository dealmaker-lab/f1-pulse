/**
 * Fantasy leaderboard for a single race.
 *
 *   GET /api/fantasy/leaderboard?year=2026&round=5
 *     → top 100 scored lineups for that race, ordered by score DESC.
 *
 * Returns masked usernames to protect Clerk user IDs (a Clerk `sub` is opaque
 * but still a stable identifier — no point exposing it). The mask is the
 * first letter of the user_id followed by its last 2 characters, e.g.
 * "user_2NaBcD…XYZ" → "u**XYZ" → we render it as "u…YZ" client-side.
 *
 * Public — no auth required to read the board, matching most fantasy games.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const LIMIT = 100;

interface LeaderboardEntry {
  rank: number;
  display: string;          // masked user identifier
  score: number;
  drivers: string[];
  constructor: string;
  budget_used: number;
}

export async function GET(req: NextRequest) {
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
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("fantasy_lineups")
      .select("user_id, score, drivers, constructor, budget_used")
      .eq("year", year)
      .eq("round", round)
      .not("score", "is", null)
      .order("score", { ascending: false })
      .limit(LIMIT);

    if (error) {
      console.error("[fantasy/leaderboard]", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const entries: LeaderboardEntry[] = (data ?? []).map((row, i) => ({
      rank: i + 1,
      display: maskUserId(row.user_id),
      score: typeof row.score === "string" ? parseFloat(row.score) : (row.score ?? 0),
      drivers: row.drivers ?? [],
      constructor: row.constructor ?? "",
      budget_used:
        typeof row.budget_used === "string"
          ? parseFloat(row.budget_used)
          : (row.budget_used ?? 0),
    }));

    return NextResponse.json({
      year,
      round,
      entries,
      count: entries.length,
    });
  } catch (err) {
    console.error("[fantasy/leaderboard]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** "user_2NaBcD...XYZ" → "u…XYZ" — non-reversible, just for human display. */
function maskUserId(userId: string): string {
  if (!userId) return "anon";
  const first = userId.charAt(0);
  const last2 = userId.length >= 2 ? userId.slice(-2) : userId;
  return `${first}…${last2}`;
}
