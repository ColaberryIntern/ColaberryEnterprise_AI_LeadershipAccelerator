import React from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ZAxis,
} from 'recharts';

interface IntelScatterChartProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

const RISK_COLORS: Record<string, string> = {
  critical: '#e53e3e',
  high: '#dd6b20',
  medium: '#d69e2e',
  low: '#38a169',
};

function getPointColor(item: Record<string, any>): string {
  if (item.risk_level) return RISK_COLORS[item.risk_level.toLowerCase()] || '#718096';
  if (item.color) return item.color;
  const score = item.risk_score ?? item.score ?? 50;
  if (score >= 75) return '#e53e3e';
  if (score >= 50) return '#dd6b20';
  if (score >= 25) return '#d69e2e';
  return '#38a169';
}

export default function IntelScatterChart({ data, config }: IntelScatterChartProps) {
  if (!data?.length) return null;

  const xKey = config.x_axis || config.x || 'x';
  const yKey = config.y_axis || config.y || 'y';
  const zKey = config.z_axis || config.size || 'size';

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey={xKey}
          type="number"
          name={config.x_label || xKey}
          tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
        />
        <YAxis
          dataKey={yKey}
          type="number"
          name={config.y_label || yKey}
          tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
        />
        <ZAxis dataKey={zKey} range={[40, 400]} />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(value: any, name?: string) => [value, name ?? '']}
          labelFormatter={(label) => `${config.x_label || xKey}: ${label}`}
        />
        <Scatter data={data} name={config.label || 'Entities'}>
          {data.map((item, i) => (
            <Cell key={i} fill={getPointColor(item)} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
