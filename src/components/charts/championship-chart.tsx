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
            tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: "#8F8F8F", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(21,21,30,0.97)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "2px",
              fontSize: "13px",
              fontFamily: "Fira Code",
              backdropFilter: "blur(12px)",
              boxShadow: "rgb(153,153,153) 1px 1px 1px 0px",
            }}
            labelStyle={{ color: "#969696", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase" as const }}
          />
          <Legend
            wrapperStyle={{ fontSize: "11px", fontFamily: "Fira Code", letterSpacing: "0.5px" }}
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
