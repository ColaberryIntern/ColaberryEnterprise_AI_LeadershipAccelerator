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

interface IntelRadarChartProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

const COLORS = ['#1a365d', '#e53e3e', '#38a169', '#805ad5'];

export default function IntelRadarChart({ data, config }: IntelRadarChartProps) {
  if (!data?.length) return null;

  const angleKey = config.angle_key || config.category || Object.keys(data[0])[0];
  const valueKeys = config.value_keys || config.series || Object.keys(data[0]).filter((k) => k !== angleKey);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="var(--color-border)" />
        <PolarAngleAxis dataKey={angleKey} tick={{ fontSize: 10, fill: 'var(--color-text-light)' }} />
        <PolarRadiusAxis tick={{ fontSize: 9 }} />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {valueKeys.map((key: string, i: number) => (
          <Radar
            key={key}
            name={key}
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.15}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}
