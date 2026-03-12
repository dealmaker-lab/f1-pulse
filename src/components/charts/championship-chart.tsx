"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DriverStanding } from "@/types/f1";

interface Props {
  drivers: DriverStanding[];
  races: string[];
}

export default function ChampionshipChart({ drivers, races }: Props) {
  // Transform data for recharts: each data point is a race
  const data = races.map((race, i) => {
    const point: Record<string, any> = { race: race.replace(" Grand Prix", "").replace(" GP", ""), round: i + 1 };
    drivers.forEach((d) => {
      point[d.driver.code] = d.pointsHistory[i] || 0;
    });
    return point;
  });

  return (
    <div className="w-full h-[400px] sm:h-[450px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="race"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#151820",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              fontSize: "13px",
              fontFamily: "Fira Code",
            }}
            labelStyle={{ color: "rgba(255,255,255,0.5)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", fontFamily: "Fira Code" }}
          />
          {drivers.map((d) => (
            <Line
              key={d.driver.code}
              type="monotone"
              dataKey={d.driver.code}
              stroke={d.driver.teamColor}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
