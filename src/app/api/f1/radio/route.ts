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

/**
 * Generate a realistic F1-style radio transcript based on context data.
 * Alternates between "engineer" and "driver" style messages using a seeded pattern.
 * Returns { speaker: "engineer"|"driver", text: string }.
 */
function generateRadioTranscript(
  events: { type: string; message: string; flag?: string }[],
  gap: { gapToLeader: string | null; interval: string | null },
  position: number | null,
  driverCode: string,
  lapNumber: number | null,
  lapTime: number | null,
  messageIndex: number
): { speaker: "engineer" | "driver"; text: string } | null {
  // Use message index to create natural back-and-forth pattern
  // ~60% engineer (even indices + multiples of 3), ~40% driver
  const isEngineer = messageIndex % 3 !== 2;

  const engineerMessages: string[] = [];
  const driverMessages: string[] = [];

  // Event-based transcripts
  for (const evt of events) {
    switch (evt.type) {
      case "safety_car":
        engineerMessages.push(
          "Safety car, safety car. Delta positive, stay above the delta.",
          "Safety car deployed, close up to the car ahead.",
        );
        driverMessages.push(
          "Copy, safety car. How long do we think?",
          "Understood. Are we boxing under the safety car?",
        );
        break;
      case "vsc":
        engineerMessages.push(
          "VSC, VSC. Reduce speed, follow the delta.",
          "Virtual safety car. Slow down and maintain delta positive.",
        );
        driverMessages.push(
          "Copy, VSC.",
          "Roger. Slowing down now.",
        );
        break;
      case "yellow_flag":
        engineerMessages.push(
          "Yellow flag, yellow flag. No overtaking.",
          `Caution ahead. Yellow flag. ${evt.message || "Stay alert."}`,
        );
        driverMessages.push(
          "Copy, yellow.",
          "Seen it, slowing down.",
        );
        break;
      case "red_flag":
        engineerMessages.push(
          "Red flag, red flag. Session stopped. Slow down and come back to the pits.",
        );
        driverMessages.push(
          "Copy, red flag. Heading in.",
          "What happened?",
        );
        break;
      case "pit":
        engineerMessages.push(
          "Box this lap, box box box.",
          "Okay we're boxing this lap. Box, box.",
          "Stay out, stay out. We'll extend this stint.",
        );
        driverMessages.push(
          "Copy, boxing.",
          "These tyres are done, I need to box.",
          "How much longer on these tyres?",
        );
        break;
      case "drs":
        if (evt.message?.toLowerCase().includes("enabled")) {
          engineerMessages.push(
            "DRS enabled. You have DRS available.",
            "DRS is active. Push now.",
          );
          driverMessages.push(
            "Copy, DRS. Let's go.",
          );
        }
        break;
      case "incident":
        engineerMessages.push(
          `Incident ahead. ${evt.message || "Stay alert, keep it clean."}`,
          "Incident reported. Be careful through that section.",
        );
        driverMessages.push(
          "What happened ahead?",
          "There's debris on the track.",
        );
        break;
      case "track_limits":
        engineerMessages.push(
          "Track limits warning. You need to stay within the white lines.",
          `Track limits — ${evt.message || "lap time deleted"}.`,
        );
        driverMessages.push(
          "Come on, I was within the limits there!",
          "Copy, I'll watch the track limits.",
        );
        break;
      case "chequered":
        engineerMessages.push(
          `Chequered flag, P${position || "?"}! Great job today, well done.`,
          `That's the chequered flag. P${position || "?"}. Brilliant drive.`,
        );
        driverMessages.push(
          position && position <= 3
            ? "YES! Get in there! What a race!"
            : position && position <= 10
              ? "Good points today. Thanks everyone."
              : "Thanks guys. Tough one today.",
        );
        break;
    }
  }

  // Position & gap based transcripts
  if (position && events.length === 0) {
    const gapNum = gap.interval ? parseFloat(gap.interval) : null;
    const gapToLeaderNum = gap.gapToLeader ? parseFloat(gap.gapToLeader) : null;

    if (position === 1) {
      engineerMessages.push(
        gapNum && gapNum > 5
          ? `You're leading by ${gap.gapToLeader} seconds. Manage the gap, look after the tyres.`
          : gapNum && gapNum < 2
            ? `Car behind is ${gap.interval}s. Keep pushing, defend the position.`
            : "You're P1. Keep it clean, bring it home.",
      );
      driverMessages.push(
        "How's the gap behind?",
        "Tyres feeling good. I can push if needed.",
        "Copy, managing the pace.",
      );
    } else if (position <= 3) {
      engineerMessages.push(
        gapNum && gapNum < 1
          ? `You're P${position}, ${gap.interval}s to the car ahead. DRS range, let's get him.`
          : `P${position}. Gap ahead is ${gap.interval || gap.gapToLeader || "stable"}. Good pace.`,
      );
      driverMessages.push(
        gapNum && gapNum < 1.5
          ? "I'm quicker than him, I can see him."
          : "Copy. What's the plan?",
      );
    } else if (position <= 10) {
      engineerMessages.push(
        `You're P${position}. ${
          gapNum && gapNum < 2
            ? `Gap ahead ${gap.interval}s. Points are in play, push now.`
            : "Focus on your own race, good pace."
        }`,
      );
      driverMessages.push(
        gapNum && gapNum < 1
          ? "I'm all over him, I need to get past."
          : "Copy, pushing.",
      );
    } else {
      engineerMessages.push(
        `P${position}. ${gapToLeaderNum && gapToLeaderNum > 30
          ? "Long stint ahead, manage the tyres."
          : "Keep pushing, look for opportunities."}`,
      );
      driverMessages.push(
        "Where's the pace? I'm struggling here.",
        "Copy, giving it everything.",
      );
    }
  }

  // Lap time based
  if (lapTime && events.length === 0 && !position) {
    const mins = Math.floor(lapTime / 60);
    const secs = (lapTime % 60).toFixed(3);
    const timeStr = mins > 0 ? `${mins}:${parseFloat(secs) < 10 ? "0" : ""}${secs}` : `${secs}`;
    engineerMessages.push(
      `Lap time ${timeStr}. Good lap, keep it consistent.`,
    );
    driverMessages.push(
      "Car feels good this lap.",
    );
  }

  // Fallback
  if (engineerMessages.length === 0 && driverMessages.length === 0) {
    return null;
  }

  if (isEngineer && engineerMessages.length > 0) {
    const text = engineerMessages[messageIndex % engineerMessages.length];
    return { speaker: "engineer", text };
  } else if (!isEngineer && driverMessages.length > 0) {
    const text = driverMessages[messageIndex % driverMessages.length];
    return { speaker: "driver", text };
  } else if (engineerMessages.length > 0) {
    return { speaker: "engineer", text: engineerMessages[0] };
  } else {
    return { speaker: "driver", text: driverMessages[0] };
  }
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

    // Map radio messages to lap numbers + context + transcript
    let messageIdx = 0;
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

          // Generate radio-style transcript
          const transcript = generateRadioTranscript(
            nearbyEvents, gap, pos, driverCode,
            lapNumber, lapData?.lap_duration ?? null,
            messageIdx++
          );

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
            transcript: transcript
              ? { speaker: transcript.speaker, text: transcript.text }
              : null,
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
