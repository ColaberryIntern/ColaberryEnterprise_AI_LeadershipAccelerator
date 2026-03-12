import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import IntelNetworkGraph from './charts/IntelNetworkGraph';
import FeedbackButtons from './FeedbackButtons';

interface Props {
  anomalies: any[];
  forecasts: any;
  riskEntities: any[];
  entityNetwork: any;
  loading?: boolean;
  entityType?: string;
}

const RISK_COLORS: Record<string, string> = {
  critical: '#e53e3e',
  high: '#dd6b20',
  medium: '#d69e2e',
  low: '#38a169',
};

function getRiskBarColor(score: number): string {
  if (score >= 80) return RISK_COLORS.critical;
  if (score >= 60) return RISK_COLORS.high;
  if (score >= 40) return RISK_COLORS.medium;
  return RISK_COLORS.low;
}

// ─── Entity-Specific Panel Configuration ─────────────────────────────────────
interface PanelConfig {
  id: string;
  title: string;
  component: string;
}

const ENTITY_PANELS: Record<string, PanelConfig[]> = {
  campaigns: [
    { id: 'risk', title: 'Campaign Performance Ranking', component: 'risk_bar' },
    { id: 'radar', title: 'Campaign Factor Analysis', component: 'radar' },
    { id: 'heatmap', title: 'Campaign Anomaly Matrix', component: 'heatmap' },
    { id: 'forecast', title: 'Lead Generation Forecast', component: 'forecast' },
    { id: 'funnel', title: 'Conversion Funnel', component: 'funnel' },
    { id: 'alerts', title: 'Campaign Alert Patterns', component: 'alerts' },
  ],
  leads: [
    { id: 'risk', title: 'Pipeline Stage Distribution', component: 'risk_bar' },
    { id: 'radar', title: 'Lead Quality Factors', component: 'radar' },
    { id: 'heatmap', title: 'Lead Activity Heatmap', component: 'heatmap' },
    { id: 'forecast', title: 'Lead Conversion Forecast', component: 'forecast' },
    { id: 'funnel', title: 'Conversion Probability', component: 'funnel' },
    { id: 'alerts', title: 'Lead Alert Patterns', component: 'alerts' },
  ],
  students: [
    { id: 'risk', title: 'Student Progress Ranking', component: 'risk_bar' },
    { id: 'radar', title: 'Completion Factor Analysis', component: 'radar' },
    { id: 'heatmap', title: 'Student Activity Heatmap', component: 'heatmap' },
    { id: 'forecast', title: 'Enrollment Forecast', component: 'forecast' },
    { id: 'funnel', title: 'Cohort Distribution', component: 'funnel' },
    { id: 'alerts', title: 'At-Risk Student Alerts', component: 'alerts' },
  ],
  agents: [
    { id: 'risk', title: 'Agent Error Rate Ranking', component: 'risk_bar' },
    { id: 'radar', title: 'Automation Impact Analysis', component: 'radar' },
    { id: 'heatmap', title: 'Agent Performance Heatmap', component: 'heatmap' },
    { id: 'forecast', title: 'Agent Activity Forecast', component: 'forecast' },
    { id: 'funnel', title: 'Execution Distribution', component: 'funnel' },
    { id: 'alerts', title: 'Agent Alert Patterns', component: 'alerts' },
  ],
  visitors: [
    { id: 'risk', title: 'Visitor Intent Ranking', component: 'risk_bar' },
    { id: 'radar', title: 'Visitor Behavior Analysis', component: 'radar' },
    { id: 'heatmap', title: 'Visitor Activity Heatmap', component: 'heatmap' },
    { id: 'forecast', title: 'Traffic Forecast', component: 'forecast' },
    { id: 'network', title: 'Visitor Journey Network', component: 'network' },
    { id: 'alerts', title: 'Visitor Alert Patterns', component: 'alerts' },
  ],
};

const DEFAULT_PANELS: PanelConfig[] = [
  { id: 'heatmap', title: 'Performance Anomaly Heatmap', component: 'heatmap' },
  { id: 'risk', title: 'Top Risk Entities', component: 'risk_bar' },
  { id: 'radar', title: 'Risk Factor Comparison', component: 'radar' },
  { id: 'forecast', title: '30-Day Lead Forecast', component: 'forecast' },
  { id: 'network', title: 'Entity Relationship Network', component: 'network' },
  { id: 'alerts', title: 'Emerging Alert Patterns', component: 'alerts' },
];

// ─── Shared Components ──────────────────────────────────────────────────────

function PanelCard({ title, children, minHeight = 300 }: { title: string; children: React.ReactNode; minHeight?: number }) {
  return (
    <div className="intel-card-float intel-fade-in" style={{ minHeight }}>
      <div className="card-header bg-white fw-semibold small border-bottom d-flex justify-content-between align-items-center" style={{ color: 'var(--color-primary)', borderRadius: '10px 10px 0 0' }}>
        <span>{title}</span>
        <FeedbackButtons contentType="analytics_panel" contentKey={`panel_${title.replace(/\s+/g, '_').toLowerCase()}`} />
      </div>
      <div className="card-body p-3 d-flex flex-column justify-content-center">
        {children}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="placeholder-glow d-flex flex-column align-items-center justify-content-center" style={{ height: 200 }}>
      <div className="spinner-border spinner-border-sm text-secondary mb-2" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
      <span className="placeholder col-6 placeholder-sm d-block" />
    </div>
  );
}

/* Panel: Performance Anomaly Heatmap */
function AnomalyHeatmap({ anomalies }: { anomalies: any[] }) {
  const { entityTypes, metrics, grid } = useMemo(() => {
    if (!anomalies?.length) return { entityTypes: [] as string[], metrics: [] as string[], grid: {} as Record<string, number> };

    const etSet = new Set<string>();
    const mSet = new Set<string>();
    const severityMap: Record<string, number> = { info: 1, warning: 2, error: 3, critical: 4 };

    anomalies.forEach((a) => {
      etSet.add(a.entity_type || 'unknown');
      mSet.add(a.metric || 'unknown');
    });

    const entityTypes = Array.from(etSet);
    const metrics = Array.from(mSet);
    const grid: Record<string, number> = {};

    anomalies.forEach((a) => {
      const key = `${a.entity_type || 'unknown'}|${a.metric || 'unknown'}`;
      const sev = severityMap[a.severity?.toLowerCase()] || 1;
      grid[key] = Math.max(grid[key] || 0, sev);
    });

    return { entityTypes, metrics, grid };
  }, [anomalies]);

  if (!anomalies?.length) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center text-muted" style={{ height: 200 }}>
        <span style={{ fontSize: '2rem', color: 'var(--color-accent)' }}>&#10003;</span>
        <small>No anomalies detected</small>
      </div>
    );
  }

  const cellSize = 40;
  const labelWidth = 100;
  const headerHeight = 60;
  const svgWidth = labelWidth + metrics.length * cellSize + 10;
  const svgHeight = headerHeight + entityTypes.length * cellSize + 10;
  const colors = ['#f7fafc', '#38a169', '#d69e2e', '#dd6b20', '#e53e3e'];

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={svgWidth} height={svgHeight} style={{ fontFamily: 'inherit' }}>
        {metrics.map((m, mi) => (
          <text
            key={`ml-${mi}`}
            x={labelWidth + mi * cellSize + cellSize / 2}
            y={headerHeight - 8}
            textAnchor="middle"
            fontSize={9}
            fill="var(--color-text-light)"
          >
            {m.length > 8 ? m.slice(0, 8) + '..' : m}
          </text>
        ))}
        {entityTypes.map((et, ei) => (
          <g key={`row-${ei}`}>
            <text
              x={labelWidth - 6}
              y={headerHeight + ei * cellSize + cellSize / 2 + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-text)"
            >
              {et.length > 12 ? et.slice(0, 12) + '..' : et}
            </text>
            {metrics.map((m, mi) => {
              const val = grid[`${et}|${m}`] || 0;
              return (
                <rect
                  key={`c-${ei}-${mi}`}
                  x={labelWidth + mi * cellSize + 2}
                  y={headerHeight + ei * cellSize + 2}
                  width={cellSize - 4}
                  height={cellSize - 4}
                  rx={4}
                  fill={colors[val]}
                  stroke="var(--color-border)"
                  strokeWidth={0.5}
                >
                  <title>{`${et} / ${m}: ${['none', 'info', 'warning', 'error', 'critical'][val]}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

/* Panel: Top Risk Entities (bar chart) */
function TopRiskEntities({ riskEntities }: { riskEntities: any[] }) {
  if (!riskEntities?.length) {
    return <small className="text-muted">No risk entities available</small>;
  }

  const sorted = [...riskEntities]
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, 8);

  const chartData = sorted.map((e) => ({
    name: e.entity || e.name || e.id || 'Unknown',
    risk_score: e.risk_score || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          tick={{ fontSize: 10, fill: 'var(--color-text)' }}
        />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Bar dataKey="risk_score" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={getRiskBarColor(entry.risk_score)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* Panel: Risk Factor Comparison (Radar) */
function RiskFactorRadar({ riskEntities }: { riskEntities: any[] }) {
  const radarData = useMemo(() => {
    if (!riskEntities?.length) return [];

    const top5 = riskEntities
      .filter((e) => e.factors && typeof e.factors === 'object')
      .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
      .slice(0, 5);

    if (!top5.length) return [];

    const allFactors = new Set<string>();
    top5.forEach((e) => Object.keys(e.factors).forEach((f) => allFactors.add(f)));

    return Array.from(allFactors).map((factor) => {
      const row: Record<string, any> = { factor };
      top5.forEach((e) => {
        const name = e.entity || e.name || e.id || 'Unknown';
        row[name] = e.factors[factor] ?? 0;
      });
      return row;
    });
  }, [riskEntities]);

  if (!radarData.length) {
    return <small className="text-muted">No risk factor data available</small>;
  }

  const entityNames = Object.keys(radarData[0]).filter((k) => k !== 'factor');
  const COLORS = ['#1a365d', '#e53e3e', '#38a169', '#805ad5', '#dd6b20'];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--color-border)" />
        <PolarAngleAxis dataKey="factor" tick={{ fontSize: 9, fill: 'var(--color-text-light)' }} />
        <PolarRadiusAxis tick={{ fontSize: 8 }} />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 11 }} />
        {entityNames.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {entityNames.map((name, i) => (
          <Radar
            key={name}
            name={name}
            dataKey={name}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.12}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* Panel: Forecast (area chart) */
function LeadForecast({ forecasts }: { forecasts: any }) {
  const data = forecasts?.leads_30d;

  if (!data?.length) {
    return <small className="text-muted">No forecast data available</small>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--color-text-light)' }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="upper"
          stroke="none"
          fill="#2b6cb0"
          fillOpacity={0.08}
          name="Upper Bound"
        />
        <Area
          type="monotone"
          dataKey="lower"
          stroke="none"
          fill="#2b6cb0"
          fillOpacity={0.08}
          name="Lower Bound"
        />
        <Area
          type="monotone"
          dataKey="predicted"
          stroke="#1a365d"
          fill="#2b6cb0"
          fillOpacity={0.15}
          strokeWidth={2}
          name="Predicted"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* Panel: Entity Network */
function EntityNetworkPanel({ entityNetwork }: { entityNetwork: any }) {
  if (!entityNetwork?.nodes?.length && !entityNetwork?.edges?.length) {
    return <small className="text-muted">No network data available</small>;
  }

  return (
    <IntelNetworkGraph
      data={entityNetwork.nodes || []}
      config={{ nodes: entityNetwork.nodes, edges: entityNetwork.edges }}
    />
  );
}

/* Panel: Conversion Funnel / Distribution (pie chart) */
function ConversionFunnel({ riskEntities, entityType }: { riskEntities: any[]; entityType?: string }) {
  const data = useMemo(() => {
    if (!riskEntities?.length) return [];
    const sorted = [...riskEntities]
      .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
      .slice(0, 6);
    return sorted.map((e) => ({
      name: e.entity || e.name || e.id || 'Unknown',
      value: e.risk_score || 0,
    }));
  }, [riskEntities]);

  if (!data.length) {
    return <small className="text-muted">No distribution data available</small>;
  }

  const COLORS = ['#1a365d', '#2b6cb0', '#38a169', '#805ad5', '#dd6b20', '#e53e3e'];

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          dataKey="value"
          nameKey="name"
          paddingAngle={2}
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* Panel: Alert Patterns (stacked bar) */
function AlertPatterns({ anomalies }: { anomalies: any[] }) {
  const chartData = useMemo(() => {
    if (!anomalies?.length) return [];

    const groups: Record<string, Record<string, number>> = {};
    anomalies.forEach((a) => {
      const et = a.entity_type || 'unknown';
      const sev = a.severity?.toLowerCase() || 'info';
      if (!groups[et]) groups[et] = {};
      groups[et][sev] = (groups[et][sev] || 0) + 1;
    });

    return Object.entries(groups).map(([entity_type, sevCounts]) => ({
      entity_type,
      ...sevCounts,
    }));
  }, [anomalies]);

  if (!chartData.length) {
    return <small className="text-muted">No alert pattern data</small>;
  }

  const severities = ['info', 'warning', 'error', 'critical'];
  const sevColors: Record<string, string> = {
    info: '#2b6cb0',
    warning: '#d69e2e',
    error: '#dd6b20',
    critical: '#e53e3e',
  };

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="entity_type" tick={{ fontSize: 9, fill: 'var(--color-text-light)' }} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {severities.map((sev) => (
          <Bar key={sev} dataKey={sev} stackId="a" fill={sevColors[sev]} name={sev} radius={0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Panel Renderer ─────────────────────────────────────────────────────────

function renderPanel(
  config: PanelConfig,
  props: { anomalies: any[]; forecasts: any; riskEntities: any[]; entityNetwork: any; loading?: boolean; entityType?: string },
) {
  const { loading } = props;

  const content = (() => {
    if (loading) return <LoadingSkeleton />;
    switch (config.component) {
      case 'heatmap':
        return <AnomalyHeatmap anomalies={props.anomalies} />;
      case 'risk_bar':
        return <TopRiskEntities riskEntities={props.riskEntities} />;
      case 'radar':
        return <RiskFactorRadar riskEntities={props.riskEntities} />;
      case 'forecast':
        return <LeadForecast forecasts={props.forecasts} />;
      case 'network':
        return <EntityNetworkPanel entityNetwork={props.entityNetwork} />;
      case 'funnel':
        return <ConversionFunnel riskEntities={props.riskEntities} entityType={props.entityType} />;
      case 'alerts':
        return <AlertPatterns anomalies={props.anomalies} />;
      default:
        return <small className="text-muted">Unknown panel type</small>;
    }
  })();

  return (
    <PanelCard key={config.id} title={config.title}>
      {content}
    </PanelCard>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function IntelligenceAnalyticsGrid({ anomalies, forecasts, riskEntities, entityNetwork, loading, entityType }: Props) {
  const panels = entityType && ENTITY_PANELS[entityType]
    ? ENTITY_PANELS[entityType]
    : DEFAULT_PANELS;

  return (
    <div
      className="intel-analytics-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1rem',
      }}
    >
      {panels.map((panel) =>
        renderPanel(panel, { anomalies, forecasts, riskEntities, entityNetwork, loading, entityType })
      )}
    </div>
  );
}
