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
  Legend,
} from 'recharts';

interface IntelClusterViewProps {
  data: Record<string, any>[];
  config: Record<string, any>;
}

const CLUSTER_COLORS = ['#1a365d', '#e53e3e', '#38a169', '#805ad5', '#dd6b20', '#d69e2e', '#2b6cb0'];

export default function IntelClusterView({ data, config }: IntelClusterViewProps) {
  if (!data?.length) return null;

  const xKey = config.x_axis || config.x || 'x';
  const yKey = config.y_axis || config.y || 'y';
  const clusterKey = config.cluster_key || config.cluster || 'cluster';

  // Group by cluster
  const clusters: Record<string, Record<string, any>[]> = {};
  data.forEach((d) => {
    const c = String(d[clusterKey] ?? 0);
    if (!clusters[c]) clusters[c] = [];
    clusters[c].push(d);
  });

  const clusterNames = Object.keys(clusters);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey={xKey}
          type="number"
          tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
          name={config.x_label || xKey}
        />
        <YAxis
          dataKey={yKey}
          type="number"
          tick={{ fontSize: 11, fill: 'var(--color-text-light)' }}
          name={config.y_label || yKey}
        />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        {clusterNames.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {clusterNames.map((name, ci) => (
          <Scatter
            key={name}
            name={config.cluster_labels?.[name] || `Cluster ${name}`}
            data={clusters[name]}
            fill={CLUSTER_COLORS[ci % CLUSTER_COLORS.length]}
          >
            {clusters[name].map((_, i) => (
              <Cell key={i} fill={CLUSTER_COLORS[ci % CLUSTER_COLORS.length]} opacity={0.7} />
            ))}
          </Scatter>
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
