import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';

interface IntelBarChartProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

const COLORS = ['#1a365d', '#2b6cb0', '#38a169', '#e53e3e', '#dd6b20', '#805ad5', '#d69e2e'];

export default function IntelBarChart({ data, config }: IntelBarChartProps) {
  if (!data?.length) return null;

  const xKey = config.x_axis || config.xKey || config.category || Object.keys(data[0])[0];
  const barKeys = config.y_axes || config.bars || Object.keys(data[0]).filter((k) => k !== xKey);
  const isHorizontal = config.layout === 'horizontal';

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        {isHorizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-light)' }} />
            <YAxis
              dataKey={xKey}
              type="category"
              tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
              width={120}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
              tickLine={false}
              angle={data.length > 6 ? -30 : 0}
              textAnchor={data.length > 6 ? 'end' : 'middle'}
              height={data.length > 6 ? 60 : 30}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-light)' }} tickLine={false} />
          </>
        )}
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        {barKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {barKeys.map((key: string, i: number) => (
          <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]}>
            {barKeys.length === 1 &&
              data.map((_: any, idx: number) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
