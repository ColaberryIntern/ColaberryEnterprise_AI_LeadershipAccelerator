import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface IntelComboChartProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

export default function IntelComboChart({ data, config }: IntelComboChartProps) {
  if (!data?.length) return null;

  const xKey = config.x_axis || Object.keys(data[0])[0];
  const barKeys = config.bar_keys || config.bars || [];
  const lineKeys = config.line_keys || config.lines || [];

  // Fallback: split keys between bars and lines
  const allKeys = Object.keys(data[0]).filter((k) => k !== xKey);
  const bars = barKeys.length ? barKeys : allKeys.slice(0, Math.ceil(allKeys.length / 2));
  const lines = lineKeys.length ? lineKeys : allKeys.slice(Math.ceil(allKeys.length / 2));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'var(--color-text-light)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-light)' }} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {bars.map((key: string, i: number) => (
          <Bar key={key} dataKey={key} fill={i === 0 ? '#1a365d' : '#2b6cb0'} radius={[4, 4, 0, 0]} />
        ))}
        {lines.map((key: string, i: number) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={i === 0 ? '#e53e3e' : '#dd6b20'}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
