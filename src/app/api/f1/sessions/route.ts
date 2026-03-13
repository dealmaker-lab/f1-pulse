import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openf1.org/v1";

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year") || "2025";
  const sessionType = req.nextUrl.searchParams.get("type"); // null = all types

  try {
    const url = sessionType
      ? `${BASE}/sessions?year=${year}&session_type=${sessionType}`
      : `${BASE}/sessions?year=${year}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
