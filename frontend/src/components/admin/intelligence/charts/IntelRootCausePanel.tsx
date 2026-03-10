import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

interface IntelRootCausePanelProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

export default function IntelRootCausePanel({ data, config }: IntelRootCausePanelProps) {
  if (!data?.length) return null;

  const featureKey = config.feature_key || config.label || Object.keys(data[0])[0];
  const valueKey = config.value_key || config.importance || config.shap || 'value';

  // Sort by absolute value descending
  const sorted = [...data]
    .sort((a, b) => Math.abs(Number(b[valueKey]) || 0) - Math.abs(Number(a[valueKey]) || 0))
    .slice(0, config.top_n || 10);

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 32 + 40)}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
          tickLine={false}
        />
        <YAxis
          dataKey={featureKey}
          type="category"
          tick={{ fontSize: 10, fill: 'var(--color-text)' }}
          width={140}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(value: any) => [Number(value).toFixed(3), 'Impact']}
        />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} barSize={20}>
          {sorted.map((d, i) => (
            <Cell
              key={i}
              fill={Number(d[valueKey]) >= 0 ? '#e53e3e' : '#2b6cb0'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
