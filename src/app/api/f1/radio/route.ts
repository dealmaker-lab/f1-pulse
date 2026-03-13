import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openf1.org/v1";

export async function GET(req: NextRequest) {
  const sessionKey = req.nextUrl.searchParams.get("session_key");
  const driverNumber = req.nextUrl.searchParams.get("driver_number");

  if (!sessionKey) {
    return NextResponse.json(
      { error: "session_key required" },
      { status: 400 }
    );
  }

  try {
    // Fetch radio messages, laps, and driver info in parallel
    const radioUrl = driverNumber
      ? `${BASE}/team_radio?session_key=${sessionKey}&driver_number=${driverNumber}`
      : `${BASE}/team_radio?session_key=${sessionKey}`;

    const lapsUrl = driverNumber
      ? `${BASE}/laps?session_key=${sessionKey}&driver_number=${driverNumber}`
      : `${BASE}/laps?session_key=${sessionKey}`;

    const [radioRes, lapsRes, driversRes] = await Promise.all([
      fetch(radioUrl, { cache: "no-store" }),
      fetch(lapsUrl, { cache: "no-store" }),
      fetch(`${BASE}/drivers?session_key=${sessionKey}`, { cache: "no-store" }),
    ]);

    const [radio, laps, drivers] = await Promise.all([
      radioRes.json(),
      lapsRes.json(),
      driversRes.json(),
    ]);

    // Build driver lookup
    const driverMap: Record<
      number,
      {
        name: string;
        code: string;
        team: string;
        teamColor: string;
        number: number;
        headshotUrl?: string;
      }
    > = {};
    if (Array.isArray(drivers)) {
      for (const d of drivers) {
        driverMap[d.driver_number] = {
          name: d.full_name || `Driver ${d.driver_number}`,
          code: d.name_acronym || String(d.driver_number),
          team: d.team_name || "Unknown",
          teamColor: d.team_colour
            ? `#${d.team_colour}`
            : "#666666",
          number: d.driver_number,
          headshotUrl: d.headshot_url,
        };
      }
    }

    // Map radio messages to lap numbers
    const enrichedRadio = Array.isArray(radio)
      ? radio.map((r: any) => {
          const radioTime = new Date(r.date).getTime();
          const driverLaps = Array.isArray(laps)
            ? laps.filter((l: any) => l.driver_number === r.driver_number)
            : [];

          let lapNumber: number | null = null;
          for (let i = 0; i < driverLaps.length; i++) {
            const lapStart = new Date(
              driverLaps[i].date_start || driverLaps[i].date
            ).getTime();
            const nextLap = driverLaps[i + 1];
            const lapEnd = nextLap
              ? new Date(nextLap.date_start || nextLap.date).getTime()
              : Infinity;
            if (radioTime >= lapStart && radioTime < lapEnd) {
              lapNumber = driverLaps[i].lap_number;
              break;
            }
          }

          // Get position at that lap
          const lapData = driverLaps.find(
            (l: any) => l.lap_number === lapNumber
          );

          const driver = driverMap[r.driver_number];

          return {
            date: r.date,
            driverNumber: r.driver_number,
            driverCode: driver?.code || String(r.driver_number),
            driverName: driver?.name || `Driver ${r.driver_number}`,
            team: driver?.team || "Unknown",
            teamColor: driver?.teamColor || "#666666",
            headshotUrl: driver?.headshotUrl,
            recordingUrl: r.recording_url,
            lapNumber,
            position: lapData?.position ?? null,
            lapTime: lapData?.lap_duration ?? null,
          };
        })
      : [];

    // Sort by timestamp
    enrichedRadio.sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return NextResponse.json({
      messages: enrichedRadio,
      drivers: Object.values(driverMap),
      totalMessages: enrichedRadio.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch radio data" },
      { status: 500 }
    );
  }
}
