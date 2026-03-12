"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ConstructorStanding } from "@/types/f1";

interface Props {
  constructors: ConstructorStanding[];
}

export default function ConstructorBarChart({ constructors }: Props) {
  const data = constructors.map((c) => ({
    team: c.team.replace(" Racing", ""),
    points: c.points,
    color: c.teamColor,
    wins: c.wins,
  }));

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Fira Code" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="team"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Fira Sans" }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip
            formatter={(value: number, name: string) => [value, "Points"]}
            contentStyle={{
              background: "#151820",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              fontFamily: "Fira Code",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="points" radius={[0, 6, 6, 0]} barSize={28}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
