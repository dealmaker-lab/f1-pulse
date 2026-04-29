/**
 * Fantasy lineup CRUD.
 *
 *   GET  /api/fantasy/lineup?year=2026&round=5
 *     → returns the signed-in user's lineup for that race (or null).
 *
 *   POST /api/fantasy/lineup
 *     body: { year, round, drivers: string[5], constructor: string, budget_used: number }
 *     → upserts the user's lineup for that race (one per user per race).
 *
 * Auth: Clerk. 401 if not signed in. Writes use the Supabase service-role key
 * since RLS is disabled (the API layer is the trust boundary — see migration).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServiceClient } from "@/lib/supabase";
import {
  FANTASY_BUDGET_M,
  FANTASY_DRIVERS_COUNT,
  FANTASY_CONSTRUCTORS_COUNT,
} from "@/lib/fantasy";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      .select("id, user_id, year, round, drivers, constructor, budget_used, score, created_at, updated_at")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("round", round)
      .maybeSingle();

    if (error) {
      console.error("[fantasy/lineup GET]", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ lineup: data ?? null });
  } catch (err) {
    console.error("[fantasy/lineup GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

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

  const parsed = parseLineupBody(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { year, round, drivers, constructor, budget_used } = parsed;

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("fantasy_lineups")
      .upsert(
        {
          user_id: userId,
          year,
          round,
          drivers,
          constructor,
          budget_used,
          // Saving a new lineup wipes any prior score — race hasn't been
          // re-scored against this lineup yet.
          score: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,year,round" },
      )
      .select()
      .single();

    if (error) {
      console.error("[fantasy/lineup POST]", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json({ lineup: data });
  } catch (err) {
    console.error("[fantasy/lineup POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

interface ParsedLineup {
  year: number;
  round: number;
  drivers: string[];
  constructor: string;
  budget_used: number;
}

function parseLineupBody(body: unknown): ParsedLineup | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body must be an object" };
  const b = body as Record<string, unknown>;

  const year = typeof b.year === "number" ? b.year : NaN;
  const round = typeof b.round === "number" ? b.round : NaN;
  if (!Number.isFinite(year) || !Number.isFinite(round)) {
    return { error: "year and round must be numbers" };
  }

  const drivers = Array.isArray(b.drivers) ? b.drivers : null;
  if (
    !drivers ||
    drivers.length !== FANTASY_DRIVERS_COUNT ||
    !drivers.every((d) => typeof d === "string" && d.length > 0)
  ) {
    return { error: `drivers must be an array of ${FANTASY_DRIVERS_COUNT} strings` };
  }
  // No duplicate drivers.
  if (new Set(drivers).size !== drivers.length) {
    return { error: "drivers must be unique" };
  }

  const constructor = typeof b.constructor === "string" ? b.constructor : "";
  if (!constructor) return { error: "constructor must be a non-empty string" };
  if (FANTASY_CONSTRUCTORS_COUNT !== 1) {
    // Future-proofing — current UI ships 1 constructor. If we ever pick more,
    // change `constructor` to `constructors: string[]` everywhere.
    return { error: "Server expects exactly 1 constructor; update API" };
  }

  const budget_used = typeof b.budget_used === "number" ? b.budget_used : NaN;
  if (!Number.isFinite(budget_used) || budget_used < 0) {
    return { error: "budget_used must be a non-negative number" };
  }
  if (budget_used > FANTASY_BUDGET_M + 0.01) {
    // Allow a tiny float-comparison cushion.
    return { error: `budget_used cannot exceed $${FANTASY_BUDGET_M}M` };
  }

  return {
    year,
    round,
    drivers: drivers as string[],
    constructor,
    budget_used,
  };
}
