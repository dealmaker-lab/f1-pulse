"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { getTireColor } from "@/lib/utils";

interface LapTimeData {
  lap: number;
  time: number;
  compound: string;
}

interface Props {
  data: LapTimeData[];
  driverCode: string;
  teamColor: string;
  showAverage?: boolean;
}

export default function LapTimesChart({ data, driverCode, teamColor, showAverage = true }: Props) {
  // Filter out pit laps for average calculation
  const racingLaps = data.filter((d) => d.time < 120);
  const avgTime = racingLaps.reduce((a, b) => a + b.time, 0) / racingLaps.length;

  // Color dots by tire compound
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || payload.time > 120) return null; // skip pit laps
    return (
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill={getTireColor(payload.compound)}
        stroke="none"
      />
    );
  };

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="lap"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
            label={{ value: "Lap", position: "insideBottomRight", offset: -5, fill: "rgba(255,255,255,0.2)", fontSize: 10 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${Math.floor(v / 60)}:${(v % 60).toFixed(0).padStart(2, "0")}`}
          />
          <Tooltip
            formatter={(value: number) => {
              const mins = Math.floor(value / 60);
              const secs = (value % 60).toFixed(3);
              return [`${mins}:${secs.padStart(6, "0")}`, driverCode];
            }}
            labelFormatter={(label) => `Lap ${label}`}
            contentStyle={{
              background: "#151820",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              fontFamily: "Fira Code",
              fontSize: "12px",
            }}
          />
          {showAverage && (
            <ReferenceLine
              y={avgTime}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="5 5"
              label={{ value: `Avg: ${Math.floor(avgTime / 60)}:${(avgTime % 60).toFixed(1).padStart(4, "0")}`, fill: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "Fira Code", position: "right" }}
            />
          )}
          <Line
            type="monotone"
            dataKey="time"
            stroke={teamColor}
            strokeWidth={1.5}
            dot={<CustomDot />}
            activeDot={{ r: 5, stroke: teamColor, strokeWidth: 2, fill: "#151820" }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
