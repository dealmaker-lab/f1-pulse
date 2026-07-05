import { NextRequest, NextResponse } from "next/server";
import { CURRENT_YEAR } from "@/lib/constants";

const BASE = "https://api.openf1.org/v1";

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year") || String(CURRENT_YEAR);

  try {
    const res = await fetch(`${BASE}/meetings?year=${year}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch meetings" }, { status: 500 });
  }
}
