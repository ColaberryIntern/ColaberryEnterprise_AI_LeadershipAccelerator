import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
} from 'recharts';

interface DemoRadarChartProps {
  data: { metric: string; current: number; potential: number }[];
}

export default function DemoRadarChart({ data }: DemoRadarChartProps) {
  if (!data?.length) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="var(--color-border)" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fontSize: 10, fill: 'var(--color-text-light)' }}
        />
        <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Radar
          name="Current"
          dataKey="current"
          stroke="#1a365d"
          fill="#1a365d"
          fillOpacity={0.15}
        />
        <Radar
          name="With AI"
          dataKey="potential"
          stroke="#38a169"
          fill="#38a169"
          fillOpacity={0.15}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
