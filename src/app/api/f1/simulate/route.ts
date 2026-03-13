import { NextRequest, NextResponse } from "next/server";

/**
 * Pit Strategy Simulator API
 *
 * Given a driver's stint data and lap times, simulates "what if" scenarios
 * by recalculating race time with different pit stop timings.
 *
 * Query params:
 *   session_key - the race session
 *   driver_number - the driver to simulate
 *   scenario - JSON array of pit laps e.g. [15, 35] for 2-stop at laps 15 and 35
 */

interface LapData {
  lap_number: number;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
  date_start: string;
}

interface StintData {
  driver_number: number;
  compound: string;
  lap_start: number;
  lap_end: number;
  stint_number: number;
}

interface PositionData {
  driver_number: number;
  position: number;
  date: string;
}

// Tire degradation model (seconds per lap of added degradation)
const TIRE_DEG: Record<string, number> = {
  SOFT: 0.08,      // degrades ~0.08s/lap
  MEDIUM: 0.05,    // degrades ~0.05s/lap
  HARD: 0.03,      // degrades ~0.03s/lap
  INTERMEDIATE: 0.06,
  WET: 0.04,
  UNKNOWN: 0.05,
};

// Base pit stop time loss (includes pit lane transit + stationary time)
const PIT_LOSS_SECONDS = 22;

export async function GET(req: NextRequest) {
  const sessionKey = req.nextUrl.searchParams.get("session_key");
  const driverNumber = req.nextUrl.searchParams.get("driver_number");
  const scenarioParam = req.nextUrl.searchParams.get("scenario"); // JSON array of { lap: number, compound: string }[]

  if (!sessionKey || !driverNumber) {
    return NextResponse.json({ error: "session_key and driver_number required" }, { status: 400 });
  }

  try {
    // Fetch actual race data
    const [lapsRes, stintsRes] = await Promise.all([
      fetch(`https://api.openf1.org/v1/laps?session_key=${sessionKey}&driver_number=${driverNumber}`, { cache: "no-store" }),
      fetch(`https://api.openf1.org/v1/stints?session_key=${sessionKey}&driver_number=${driverNumber}`, { cache: "no-store" }),
    ]);

    const laps: LapData[] = (await lapsRes.json()) || [];
    const stints: StintData[] = (await stintsRes.json()) || [];

    if (!laps.length || !stints.length) {
      return NextResponse.json({ error: "No data available for this driver/session" }, { status: 404 });
    }

    // Build actual stint map
    const validLaps = laps
      .filter((l) => l.lap_duration && l.lap_duration > 0 && l.lap_duration < 200)
      .sort((a, b) => a.lap_number - b.lap_number);

    const totalLaps = Math.max(...validLaps.map((l) => l.lap_number));
    const actualStints = stints.sort((a, b) => a.stint_number - b.stint_number);

    // Calculate "clean" base pace per compound (median of non-outlier laps in each stint)
    const compoundPaces: Record<string, number> = {};
    for (const stint of actualStints) {
      const stintLaps = validLaps.filter(
        (l) => l.lap_number >= stint.lap_start && l.lap_number <= stint.lap_end && !l.is_pit_out_lap
      );
      if (stintLaps.length < 2) continue;

      // Take median of first half of stint (freshest tires)
      const freshLaps = stintLaps.slice(0, Math.ceil(stintLaps.length / 2));
      const times = freshLaps.map((l) => l.lap_duration!).sort((a, b) => a - b);
      const median = times[Math.floor(times.length / 2)];

      const compound = stint.compound || "UNKNOWN";
      if (!compoundPaces[compound] || median < compoundPaces[compound]) {
        compoundPaces[compound] = median;
      }
    }

    // Parse scenario
    let scenario: { lap: number; compound: string }[] = [];
    if (scenarioParam) {
      try {
        scenario = JSON.parse(scenarioParam);
      } catch {
        return NextResponse.json({ error: "Invalid scenario JSON" }, { status: 400 });
      }
    }

    // Calculate actual race time
    const actualTotalTime = validLaps.reduce((sum, l) => sum + (l.lap_duration || 0), 0);
    const actualPitStops = actualStints.length - 1;

    // Calculate actual lap-by-lap times
    const actualLapTimes = validLaps.map((l) => ({
      lap: l.lap_number,
      time: l.lap_duration || 0,
      isPitOut: l.is_pit_out_lap,
    }));

    // Simulate alternative scenario
    if (scenario.length > 0) {
      // Sort pit stops
      const pitLaps = scenario.sort((a, b) => a.lap - b.lap);

      // Build simulated stints
      const simStints: { startLap: number; endLap: number; compound: string }[] = [];
      let prevLap = 1;

      // First stint uses the actual starting compound
      const startCompound = actualStints[0]?.compound || "MEDIUM";
      for (let i = 0; i < pitLaps.length; i++) {
        simStints.push({
          startLap: prevLap,
          endLap: pitLaps[i].lap,
          compound: i === 0 ? startCompound : pitLaps[i - 1]?.compound || "MEDIUM",
        });
        prevLap = pitLaps[i].lap + 1;
      }
      // Final stint
      simStints.push({
        startLap: prevLap,
        endLap: totalLaps,
        compound: pitLaps[pitLaps.length - 1]?.compound || "HARD",
      });

      // Calculate simulated lap times
      const simLapTimes: { lap: number; time: number; isPitOut: boolean }[] = [];
      let simTotalTime = 0;

      for (const stint of simStints) {
        const compound = stint.compound;
        const basePace = compoundPaces[compound] || compoundPaces["MEDIUM"] || 90;
        const deg = TIRE_DEG[compound] || 0.05;

        for (let lap = stint.startLap; lap <= stint.endLap && lap <= totalLaps; lap++) {
          const tireAge = lap - stint.startLap;
          const isPitOut = lap === stint.startLap && stint.startLap > 1;

          let lapTime = basePace + (tireAge * deg);
          if (isPitOut) lapTime += PIT_LOSS_SECONDS;

          simLapTimes.push({ lap, time: lapTime, isPitOut });
          simTotalTime += lapTime;
        }
      }

      const simPitStops = pitLaps.length;
      const delta = simTotalTime - actualTotalTime;

      return NextResponse.json({
        totalLaps,
        actual: {
          totalTime: actualTotalTime,
          pitStops: actualPitStops,
          stints: actualStints.map((s) => ({
            compound: s.compound,
            startLap: s.lap_start,
            endLap: s.lap_end,
            laps: s.lap_end - s.lap_start + 1,
          })),
          lapTimes: actualLapTimes,
        },
        simulated: {
          totalTime: simTotalTime,
          pitStops: simPitStops,
          stints: simStints.map((s) => ({
            compound: s.compound,
            startLap: s.startLap,
            endLap: s.endLap,
            laps: s.endLap - s.startLap + 1,
          })),
          lapTimes: simLapTimes,
          scenario: pitLaps,
        },
        delta,
        deltaFormatted: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}s`,
        compoundPaces,
        tireDegModel: TIRE_DEG,
      });
    }

    // No scenario — just return actual data + tire model for the UI
    return NextResponse.json({
      totalLaps,
      actual: {
        totalTime: actualTotalTime,
        pitStops: actualPitStops,
        stints: actualStints.map((s) => ({
          compound: s.compound,
          startLap: s.lap_start,
          endLap: s.lap_end,
          laps: s.lap_end - s.lap_start + 1,
        })),
        lapTimes: actualLapTimes,
      },
      compoundPaces,
      tireDegModel: TIRE_DEG,
    });
  } catch (err) {
    console.error("Simulation error:", err);
    return NextResponse.json({ error: "Simulation failed" }, { status: 500 });
  }
}
