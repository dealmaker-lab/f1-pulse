/**
 * Driver of the Day voting.
 *
 *   POST /api/dotd/vote
 *     body: { year: number, round: number, driver_code: string }
 *     → upserts the signed-in user's vote for that race (one per user per race).
 *
 *   GET /api/dotd/vote?year=2026&round=5
 *     → tallies for that race: { tallies: { CODE: count }, total: number, my_vote: code | null }
 *     If signed in, also returns the caller's current vote in `my_vote`.
 *
 * Auth: POST requires Clerk (401 if signed out). GET is public.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const year = typeof b.year === "number" ? b.year : NaN;
  const round = typeof b.round === "number" ? b.round : NaN;
  const driver_code = typeof b.driver_code === "string" ? b.driver_code.trim().toUpperCase() : "";

  if (!Number.isFinite(year) || !Number.isFinite(round)) {
    return NextResponse.json({ error: "year and round must be numbers" }, { status: 400 });
  }
  if (!driver_code || driver_code.length < 2 || driver_code.length > 4) {
    return NextResponse.json({ error: "driver_code must be a 3-letter code" }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("dotd_votes")
      .upsert(
        { user_id: userId, year, round, driver_code },
        { onConflict: "user_id,year,round" },
      )
      .select()
      .single();

    if (error) {
      console.error("[dotd/vote POST]", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ vote: data });
  } catch (err) {
    console.error("[dotd/vote POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
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
      .from("dotd_votes")
      .select("driver_code, user_id")
      .eq("year", year)
      .eq("round", round);

    if (error) {
      console.error("[dotd/vote GET]", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const tallies: Record<string, number> = {};
    let total = 0;
    for (const row of data ?? []) {
      const code = (row.driver_code as string) ?? "";
      if (!code) continue;
      tallies[code] = (tallies[code] ?? 0) + 1;
      total++;
    }

    // Best-effort: surface the caller's vote if signed in. We don't 401 here —
    // anonymous users can still see tallies.
    let my_vote: string | null = null;
    try {
      const { userId } = await auth();
      if (userId) {
        const mine = (data ?? []).find((r) => r.user_id === userId);
        my_vote = (mine?.driver_code as string) ?? null;
      }
    } catch {
      // auth() can be tricky in some Next runtimes; ignore.
    }

    return NextResponse.json({ year, round, tallies, total, my_vote });
  } catch (err) {
    console.error("[dotd/vote GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
