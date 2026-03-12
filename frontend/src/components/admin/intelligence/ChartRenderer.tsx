import React, { Suspense, lazy } from 'react';
import CoryExplainMenu from './CoryExplainMenu';
import FeedbackButtons from './FeedbackButtons';

const IntelLineChart = lazy(() => import('./charts/IntelLineChart'));
const IntelBarChart = lazy(() => import('./charts/IntelBarChart'));
const IntelComboChart = lazy(() => import('./charts/IntelComboChart'));
const IntelRadarChart = lazy(() => import('./charts/IntelRadarChart'));
const IntelForecastChart = lazy(() => import('./charts/IntelForecastChart'));
const IntelScatterChart = lazy(() => import('./charts/IntelScatterChart'));
const IntelHeatmap = lazy(() => import('./charts/IntelHeatmap'));
const IntelNetworkGraph = lazy(() => import('./charts/IntelNetworkGraph'));
const IntelWaterfallChart = lazy(() => import('./charts/IntelWaterfallChart'));
const IntelClusterView = lazy(() => import('./charts/IntelClusterView'));
const IntelRootCausePanel = lazy(() => import('./charts/IntelRootCausePanel'));

type ChartProps = { data: Record<string, any>[]; config: Record<string, any> };

const CHART_MAP: Record<string, React.LazyExoticComponent<React.ComponentType<ChartProps>>> = {
  line: IntelLineChart,
  bar: IntelBarChart,
  combo: IntelComboChart,
  radar: IntelRadarChart,
  forecast: IntelForecastChart,
  forecast_cone: IntelForecastChart,
  risk: IntelScatterChart,
  risk_matrix: IntelScatterChart,
  scatter: IntelScatterChart,
  heatmap: IntelHeatmap,
  network: IntelNetworkGraph,
  waterfall: IntelWaterfallChart,
  cluster: IntelClusterView,
  root_cause: IntelRootCausePanel,
  root_cause_split: IntelRootCausePanel,
  tree: IntelBarChart, // fallback to bar for decomposition
  geo: IntelHeatmap, // fallback to heatmap for geo data
};

const EMPTY_HINTS: Record<string, string> = {
  line: 'Trend data not available. Try asking about revenue or performance over time.',
  bar: 'Comparison data not available. Try asking about risk factors or entity rankings.',
  heatmap: 'Heatmap requires density data. Ask about complaint density or performance distribution.',
  forecast: 'Forecast requires time-series data. Ask about forecasting revenue or metrics.',
  risk: 'Risk matrix not available. Ask about which entities show operational risk.',
  network: 'Network data not available. Ask about entity relationships or similarities.',
  radar: 'Radar data not available. Ask about multi-factor comparisons.',
  cluster: 'Cluster data not available. Ask about text patterns or grouping entities.',
  root_cause: 'Root cause data not available. Ask about what caused a specific change.',
  waterfall: 'Waterfall data not available. Ask about decomposition of a metric.',
};

interface VisualizationSpec {
  chart_type: string;
  title: string;
  data: Record<string, any>[];
  config: Record<string, any>;
}

interface ChartRendererProps {
  visualization: VisualizationSpec;
  onCoryClick?: (context: string) => void;
}

function isDataEmpty(data: any): boolean {
  if (!data) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
}

function extractKPIs(viz: VisualizationSpec): { label: string; value: string; color: string }[] {
  const kpis: { label: string; value: string; color: string }[] = [];
  const cfg = viz.config || {};

  if (cfg.peak) kpis.push({ label: `Peak: ${cfg.peak}`, value: String(cfg.peak_value ?? ''), color: '#2b6cb0' });
  if (cfg.items_count) kpis.push({ label: `Items: ${cfg.items_count}`, value: '', color: '#38a169' });
  if (cfg.forecast_end) kpis.push({ label: `Forecast End: ${cfg.forecast_end}`, value: '', color: '#805ad5' });
  if (cfg.ci_width) kpis.push({ label: `CI Width: ${cfg.ci_width}`, value: '', color: '#dd6b20' });
  if (cfg.best) kpis.push({ label: `Best: ${cfg.best}`, value: '', color: '#38a169' });
  if (cfg.weakest) kpis.push({ label: `Weakest: ${cfg.weakest}`, value: '', color: '#e53e3e' });

  return kpis;
}

export default function ChartRenderer({ visualization, onCoryClick }: ChartRendererProps) {
  const { chart_type, title, data, config } = visualization;
  const ChartComponent = CHART_MAP[chart_type];
  const kpis = extractKPIs(visualization);

  const handleCoryClick = onCoryClick
    ? () => {
        const dataSample = Array.isArray(data) ? data.slice(0, 5) : [];
        const summary = dataSample.map((d) => Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ')).join('; ');
        onCoryClick(`Analyze the "${title}" chart (${chart_type} chart). Data sample: ${summary}. Give me a full executive report with flagged KPIs, key findings, risk assessment, and recommended actions.`);
      }
    : undefined;

  return (
    <div className="intel-card-float intel-fade-in">
      <div className="card-header bg-white d-flex justify-content-between align-items-center py-2" style={{ borderRadius: '10px 10px 0 0' }}>
        <div className="d-flex align-items-center gap-2">
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>{title}</span>
          <CoryExplainMenu
            chartData={Array.isArray(data) ? data.slice(0, 10) : data}
            chartType={chart_type}
            chartTitle={title}
            onResult={onCoryClick ? (result: string) => onCoryClick(result) : undefined}
            size={18}
          />
          <FeedbackButtons contentType="chart" contentKey={`${chart_type}_${title.replace(/\s+/g, '_').toLowerCase()}`} />
        </div>
        {kpis.length > 0 && (
          <div className="d-flex gap-1 flex-wrap">
            {kpis.map((kpi, i) => (
              <span
                key={i}
                className="badge"
                style={{
                  fontSize: '0.6rem',
                  background: `${kpi.color}22`,
                  color: kpi.color,
                  border: `1px solid ${kpi.color}55`,
                }}
              >
                {kpi.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="card-body p-2" style={{ minHeight: '200px' }}>
        {!ChartComponent ? (
          <div className="d-flex align-items-center justify-content-center h-100 text-muted">
            <small>Unsupported chart type: {chart_type}</small>
          </div>
        ) : isDataEmpty(data) ? (
          <div className="d-flex align-items-center justify-content-center h-100 text-muted">
            <small>{EMPTY_HINTS[chart_type] || 'No data available for this visualization.'}</small>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="d-flex align-items-center justify-content-center h-100">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Loading chart...</span>
                </div>
              </div>
            }
          >
            <ChartComponent data={data} config={config || {}} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
