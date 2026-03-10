import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';

interface IntelWaterfallChartProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

export default function IntelWaterfallChart({ data, config }: IntelWaterfallChartProps) {
  if (!data?.length) return null;

  const labelKey = config.label_key || config.category || Object.keys(data[0])[0];
  const valueKey = config.value_key || config.value || 'value';

  const processedData = useMemo(() => {
    let cumulative = 0;
    return data.map((d) => {
      const val = Number(d[valueKey]) || 0;
      const start = cumulative;
      cumulative += val;
      return {
        label: d[labelKey],
        value: val,
        start,
        end: cumulative,
        isTotal: d.is_total || false,
      };
    });
  }, [data, labelKey, valueKey]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={processedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="label"
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
          formatter={(value: any, name?: string) => {
            if (name === 'start') return ['', ''];
            return [value, 'Value'];
          }}
        />
        <ReferenceLine y={0} stroke="var(--color-text-light)" />
        {/* Invisible base bar */}
        <Bar dataKey="start" stackId="waterfall" fill="transparent" />
        {/* Visible value bar */}
        <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
          {processedData.map((d, i) => (
            <Cell
              key={i}
              fill={d.isTotal ? '#1a365d' : d.value >= 0 ? '#38a169' : '#e53e3e'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
