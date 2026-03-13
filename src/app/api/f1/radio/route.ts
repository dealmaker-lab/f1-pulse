import { NextRequest, NextResponse } from "next/server";
import { DRIVER_FALLBACK, getTeamInfo, DRIVER_HEADSHOTS } from "@/lib/team-logos";

const BASE = "https://api.openf1.org/v1";

/** Find race control events within ±N seconds of a timestamp */
function findNearbyEvents(
  raceControlEvents: any[],
  timestamp: number,
  windowMs = 15_000
): { type: string; message: string; flag?: string }[] {
  const results: { type: string; message: string; flag?: string }[] = [];
  for (const evt of raceControlEvents) {
    const evtTime = new Date(evt.date).getTime();
    if (Math.abs(evtTime - timestamp) <= windowMs) {
      const flag = evt.flag || undefined;
      const category = evt.category || "";
      const message = evt.message || "";
      let type = "event";

      if (flag === "YELLOW" || flag === "DOUBLE YELLOW") type = "yellow_flag";
      else if (flag === "RED") type = "red_flag";
      else if (flag === "GREEN") type = "green_flag";
      else if (message.toLowerCase().includes("safety car") || category === "SafetyCar")
        type = "safety_car";
      else if (message.toLowerCase().includes("virtual safety car") || category === "Vsc")
        type = "vsc";
      else if (message.toLowerCase().includes("drs")) type = "drs";
      else if (
        message.toLowerCase().includes("pit") ||
        category === "PitEntry" ||
        category === "PitExit"
      )
        type = "pit";
      else if (message.toLowerCase().includes("track limits")) type = "track_limits";
      else if (
        message.toLowerCase().includes("incident") ||
        message.toLowerCase().includes("off track") ||
        message.toLowerCase().includes("spun")
      )
        type = "incident";
      else if (flag === "CHEQUERED") type = "chequered";

      results.push({ type, message, flag });
    }
  }
  // Deduplicate by type
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.type)) return false;
    seen.add(r.type);
    return true;
  });
}

/** Generate a human-readable context description */
function generateContextDescription(
  events: { type: string; message: string; flag?: string }[],
  gap: { gapToLeader: string | null; interval: string | null },
  position: number | null,
  driverCode: string
): string | null {
  const parts: string[] = [];

  // Position context
  if (position) {
    if (position === 1) parts.push(`${driverCode} leading the race`);
    else if (position <= 3) parts.push(`${driverCode} running P${position}`);
    else parts.push(`${driverCode} in P${position}`);
  }

  // Gap context
  if (gap.gapToLeader && position && position > 1) {
    const gapNum = parseFloat(gap.gapToLeader);
    if (!isNaN(gapNum)) {
      if (gapNum < 1) parts.push("within DRS range of car ahead");
      else if (gapNum < 3) parts.push(`close to car ahead (+${gap.interval || gap.gapToLeader}s)`);
    }
  }

  // Event context
  for (const evt of events) {
    switch (evt.type) {
      case "safety_car":
        parts.push("Safety Car deployed — field bunched up");
        break;
      case "vsc":
        parts.push("Virtual Safety Car active — speed limited");
        break;
      case "yellow_flag":
        parts.push(`Yellow flag — ${evt.message || "caution on track"}`);
        break;
      case "red_flag":
        parts.push("Red flag — session stopped");
        break;
      case "incident":
        parts.push(`Incident reported — ${evt.message || "on-track event"}`);
        break;
      case "pit":
        parts.push("Pit activity in progress");
        break;
      case "drs":
        if (evt.message?.toLowerCase().includes("enabled")) parts.push("DRS enabled");
        else if (evt.message?.toLowerCase().includes("disabled")) parts.push("DRS disabled");
        break;
      case "track_limits":
        parts.push(`Track limits: ${evt.message || "lap time deleted"}`);
        break;
      case "chequered":
        parts.push("Chequered flag — race complete");
        break;
    }
  }

  if (parts.length === 0) return null;
  return parts.join(". ") + ".";
}

/** Find the closest interval entry for a driver near a timestamp */
function findInterval(
  intervals: any[],
  driverNumber: number,
  timestamp: number
): { gapToLeader: string | null; interval: string | null } {
  let closest: any = null;
  let closestDelta = Infinity;

  for (const iv of intervals) {
    if (iv.driver_number !== driverNumber) continue;
    const delta = Math.abs(new Date(iv.date).getTime() - timestamp);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = iv;
    }
    // Intervals are sorted by time, so if we start getting further away, break
    if (delta > closestDelta && closestDelta < 60_000) break;
  }

  if (!closest || closestDelta > 30_000) {
    return { gapToLeader: null, interval: null };
  }

  return {
    gapToLeader: closest.gap_to_leader != null ? String(closest.gap_to_leader) : null,
    interval: closest.interval != null ? String(closest.interval) : null,
  };
}

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
    // Fetch radio, laps, drivers, race_control, and intervals in parallel
    const radioUrl = driverNumber
      ? `${BASE}/team_radio?session_key=${sessionKey}&driver_number=${driverNumber}`
      : `${BASE}/team_radio?session_key=${sessionKey}`;

    const lapsUrl = driverNumber
      ? `${BASE}/laps?session_key=${sessionKey}&driver_number=${driverNumber}`
      : `${BASE}/laps?session_key=${sessionKey}`;

    const [radioRes, lapsRes, driversRes, raceControlRes, intervalsRes] =
      await Promise.all([
        fetch(radioUrl, { cache: "no-store" }),
        fetch(lapsUrl, { cache: "no-store" }),
        fetch(`${BASE}/drivers?session_key=${sessionKey}`, { cache: "no-store" }),
        fetch(`${BASE}/race_control?session_key=${sessionKey}`, { cache: "no-store" }),
        fetch(
          `${BASE}/intervals?session_key=${sessionKey}${
            driverNumber ? `&driver_number=${driverNumber}` : ""
          }`,
          { cache: "no-store" }
        ),
      ]);

    const [radio, laps, drivers, raceControl, intervals] = await Promise.all([
      radioRes.json(),
      lapsRes.json(),
      driversRes.json(),
      raceControlRes.json().catch(() => []),
      intervalsRes.json().catch(() => []),
    ]);

    // Build driver lookup with fallback data for incomplete API responses
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
        const num = d.driver_number;
        const fallback = DRIVER_FALLBACK[num];
        const code = d.name_acronym || fallback?.code || String(num);
        const team = d.team_name || fallback?.team || "Unknown";
        const teamInfo = getTeamInfo(team);
        const teamColor = d.team_colour
          ? `#${d.team_colour}`
          : teamInfo?.color || "#666666";

        driverMap[num] = {
          name: d.full_name || fallback?.name || `Driver ${num}`,
          code,
          team,
          teamColor,
          number: num,
          headshotUrl: d.headshot_url || DRIVER_HEADSHOTS[code] || undefined,
        };
      }
    }

    // Also add any drivers from radio that aren't in the drivers list
    if (Array.isArray(radio)) {
      for (const r of radio) {
        if (!driverMap[r.driver_number]) {
          const fb = DRIVER_FALLBACK[r.driver_number];
          if (fb) {
            const teamInfo = getTeamInfo(fb.team);
            driverMap[r.driver_number] = {
              name: fb.name,
              code: fb.code,
              team: fb.team,
              teamColor: teamInfo?.color || "#666666",
              number: r.driver_number,
              headshotUrl: DRIVER_HEADSHOTS[fb.code] || undefined,
            };
          }
        }
      }
    }

    const rcEvents = Array.isArray(raceControl) ? raceControl : [];
    const ivData = Array.isArray(intervals) ? intervals : [];

    // Map radio messages to lap numbers + context
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

          const lapData = driverLaps.find(
            (l: any) => l.lap_number === lapNumber
          );

          const driver = driverMap[r.driver_number];

          // On-track context
          const nearbyEvents = findNearbyEvents(rcEvents, radioTime);
          const gap = findInterval(ivData, r.driver_number, radioTime);
          const driverCode = driver?.code || String(r.driver_number);
          const pos = lapData?.position ?? null;
          const description = generateContextDescription(nearbyEvents, gap, pos, driverCode);

          return {
            date: r.date,
            driverNumber: r.driver_number,
            driverCode,
            driverName: driver?.name || `Driver ${r.driver_number}`,
            team: driver?.team || "Unknown",
            teamColor: driver?.teamColor || "#666666",
            headshotUrl: driver?.headshotUrl,
            recordingUrl: r.recording_url,
            lapNumber,
            position: pos,
            lapTime: lapData?.lap_duration ?? null,
            context: {
              events: nearbyEvents,
              gapToLeader: gap.gapToLeader,
              interval: gap.interval,
              description,
            },
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
