import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface IntelLineChartProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

const COLORS = ['#1a365d', '#2b6cb0', '#38a169', '#e53e3e', '#dd6b20', '#805ad5'];

export default function IntelLineChart({ data, config }: IntelLineChartProps) {
  if (!data?.length) return null;

  const xKey = config.x_axis || config.xKey || Object.keys(data[0])[0];
  const lineKeys = config.y_axes || config.lines || Object.keys(data[0]).filter((k) => k !== xKey);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-light)' }} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        {lineKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {lineKeys.map((key: string, i: number) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
