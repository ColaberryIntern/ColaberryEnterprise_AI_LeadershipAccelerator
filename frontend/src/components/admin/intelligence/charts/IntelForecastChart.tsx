import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface IntelForecastChartProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

export default function IntelForecastChart({ data, config }: IntelForecastChartProps) {
  if (!data?.length) return null;

  const xKey = config.x_axis || config.date_key || Object.keys(data[0])[0];
  const forecastKey = config.forecast_key || config.forecast || 'forecast';
  const upperKey = config.upper_key || config.upper_bound || 'upper_bound';
  const lowerKey = config.lower_key || config.lower_bound || 'lower_bound';
  const actualKey = config.actual_key || config.actual || 'actual';

  // Check which keys exist in data
  const sampleKeys = Object.keys(data[0]);
  const hasUpper = sampleKeys.includes(upperKey);
  const hasLower = sampleKeys.includes(lowerKey);
  const hasActual = sampleKeys.includes(actualKey);
  const hasForecast = sampleKeys.includes(forecastKey);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
        {hasUpper && (
          <Area
            type="monotone"
            dataKey={upperKey}
            stroke="none"
            fill="#2b6cb0"
            fillOpacity={0.1}
            name="Upper Bound"
          />
        )}
        {hasLower && (
          <Area
            type="monotone"
            dataKey={lowerKey}
            stroke="none"
            fill="#ffffff"
            fillOpacity={1}
            name="Lower Bound"
          />
        )}
        {hasForecast && (
          <Line
            type="monotone"
            dataKey={forecastKey}
            stroke="#2b6cb0"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Forecast"
          />
        )}
        {hasActual && (
          <Line
            type="monotone"
            dataKey={actualKey}
            stroke="#1a365d"
            strokeWidth={2}
            dot={{ r: 2 }}
            name="Actual"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
