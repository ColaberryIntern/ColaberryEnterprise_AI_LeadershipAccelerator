// ─── Chart Selector ──────────────────────────────────────────────────────
// Selects chart types based on intent + data shape. Guarantees minimum charts.

import { Intent } from './intentClassifier';
import { SqlResult } from './sqlExecutor';
import { MlResult } from './mlExecutor';
import { VectorResult } from './vectorExecutor';

export type ChartType =
  | 'line' | 'bar' | 'combo' | 'heatmap' | 'geo'
  | 'network' | 'radar' | 'waterfall' | 'forecast_cone'
  | 'risk_matrix' | 'decomposition_tree' | 'cluster';

export interface ChartConfig {
  type: ChartType;
  title: string;
  data: Record<string, any>[];
  labelKey: string;
  valueKey: string;
}

/**
 * Select and configure visualizations from query results.
 * Returns max 4 charts.
 */
export function selectVisualizations(
  intent: Intent,
  sqlResults: SqlResult[],
  mlResults: MlResult[],
  vectorResults: VectorResult[]
): ChartConfig[] {
  const charts: ChartConfig[] = [];

  // SQL-based charts
  for (const sr of sqlResults) {
    if (sr.rows.length === 0) continue;
    const { labelKey, valueKey } = detectKeys(sr.rows);

    if (!labelKey || !valueKey) {
      // Fallback: find any string + numeric key pair and make a bar chart
      const fallbackLabel = findStringKey(sr.rows[0], Object.keys(sr.rows[0])) || Object.keys(sr.rows[0])[0];
      const fallbackValue = findNumericKey(sr.rows[0], Object.keys(sr.rows[0])) || Object.keys(sr.rows[0])[1] || Object.keys(sr.rows[0])[0];
      charts.push({
        type: 'bar',
        title: sr.description,
        data: sr.rows.slice(0, 20).map((r) => ({
          label: formatLabel(r[fallbackLabel]),
          value: Number(r[fallbackValue]) || 0,
        })),
        labelKey: 'label',
        valueKey: 'value',
      });
      continue;
    }

    const chartType = selectChartType(intent, sr.description, sr.rows);
    charts.push({
      type: chartType,
      title: sr.description,
      data: sr.rows.map((r) => ({
        label: formatLabel(r[labelKey]),
        value: Number(r[valueKey]) || 0,
      })),
      labelKey: 'label',
      valueKey: 'value',
    });
  }

  // ML-based charts
  for (const mr of mlResults) {
    if (mr.status !== 'success' || mr.data.length === 0) continue;

    if (mr.task === 'anomaly_detector') {
      const { labelKey, valueKey } = detectKeys(mr.data);
      if (labelKey && valueKey) {
        charts.push({
          type: 'heatmap',
          title: 'Anomaly Detection Results',
          data: mr.data.slice(0, 20).map((r) => ({
            label: formatLabel(r[labelKey]),
            value: Number(r[valueKey]) || Number(r.anomaly_score) || 0,
          })),
          labelKey: 'label',
          valueKey: 'value',
        });
      }
    }

    if (mr.task === 'forecaster') {
      charts.push({
        type: 'forecast_cone',
        title: 'ML Forecast',
        data: mr.data.slice(0, 30),
        labelKey: mr.data[0]?.ds ? 'ds' : 'date',
        valueKey: mr.data[0]?.yhat ? 'yhat' : 'value',
      });
    }

    if (mr.task === 'risk_scorer') {
      charts.push({
        type: 'risk_matrix',
        title: 'Risk Scores',
        data: mr.data.slice(0, 20),
        labelKey: mr.data[0]?.entity ? 'entity' : 'name',
        valueKey: mr.data[0]?.risk_score ? 'risk_score' : 'score',
      });
    }

    if (mr.task === 'text_clusterer') {
      charts.push({
        type: 'cluster',
        title: 'Text Clusters',
        data: mr.data.slice(0, 30),
        labelKey: mr.data[0]?.cluster_label ? 'cluster_label' : 'label',
        valueKey: mr.data[0]?.cluster_id ? 'cluster_id' : 'value',
      });
    }
  }

  // Vector-based charts
  for (const vr of vectorResults) {
    if (vr.status !== 'success' || vr.data.length === 0) continue;
    charts.push({
      type: 'network',
      title: 'Related Entities',
      data: vr.data.slice(0, 15).map((d) => ({
        label: d.name || d.label || d.entity || 'Unknown',
        value: Number(d.similarity || d.score || 0),
      })),
      labelKey: 'label',
      valueKey: 'value',
    });
  }

  return charts.slice(0, 4);
}

/**
 * Guarantee at least 2 charts are returned. Synthesizes additional charts
 * from SQL data if needed, picking types that differ from existing ones.
 */
export function guaranteeCharts(
  charts: ChartConfig[],
  intent: Intent,
  sqlResults: SqlResult[]
): ChartConfig[] {
  if (charts.length >= 2) return charts;

  const existingTypes = new Set(charts.map((c) => c.type));
  const VARIETY_TYPES: ChartType[] = ['radar', 'line', 'bar', 'combo'];

  // Try to synthesize a chart from each SQL result with a different type
  for (const sr of sqlResults) {
    if (sr.rows.length === 0 || charts.length >= 2) continue;
    const keys = Object.keys(sr.rows[0]);
    const stringKey = keys.find((k) => typeof sr.rows[0][k] === 'string' && !k.endsWith('_at') && !k.endsWith('_id'));
    const numericKey = keys.find((k) => typeof sr.rows[0][k] === 'number');
    if (!stringKey || !numericKey) continue;

    const selectedType = VARIETY_TYPES.find((t) => !existingTypes.has(t)) || 'bar';
    existingTypes.add(selectedType);

    charts.push({
      type: selectedType,
      title: `${sr.description} — Overview`,
      data: sr.rows.slice(0, 10).map((r) => ({
        label: formatLabel(r[stringKey]),
        value: Number(r[numericKey]) || 0,
      })),
      labelKey: 'label',
      valueKey: 'value',
    });
  }

  // Last resort: summary chart showing row counts per SQL query
  if (charts.length < 2 && sqlResults.some((sr) => sr.rows.length > 0)) {
    const summaryData = sqlResults
      .filter((sr) => sr.rows.length > 0)
      .map((sr) => ({
        label: sr.description.length > 35 ? sr.description.slice(0, 35) + '...' : sr.description,
        value: sr.rows.length,
      }));
    if (summaryData.length > 0) {
      const selectedType = VARIETY_TYPES.find((t) => !existingTypes.has(t)) || 'bar';
      charts.push({
        type: selectedType,
        title: 'Data Coverage Summary',
        data: summaryData,
        labelKey: 'label',
        valueKey: 'value',
      });
    }
  }

  return charts.slice(0, 4);
}

// ─── Chart Type Selection ────────────────────────────────────────────────────

function selectChartType(intent: Intent, description: string, rows: Record<string, any>[]): ChartType {
  const desc = description.toLowerCase();

  // Time-series → line
  if (desc.includes('trend') || desc.includes('weekly') || desc.includes('daily') || desc.includes('over time')) return 'line';
  if (hasTimeColumn(rows)) return 'line';

  // Forecast → line
  if (intent === 'forecast_request') return 'line';

  // Multi-metric with time → combo
  const numericKeys = Object.keys(rows[0] || {}).filter((k) => typeof rows[0][k] === 'number');
  if (numericKeys.length >= 2 && hasTimeColumn(rows)) return 'combo';

  // Waterfall for breakdowns
  if (desc.includes('breakdown') || desc.includes('contribution') || desc.includes('waterfall')) return 'waterfall';

  // Distribution → bar (no pie — no IntelPieChart component)
  if (desc.includes('distribution') || desc.includes('by status') || desc.includes('by type')) return 'bar';

  // Comparison → radar for small sets
  if (intent === 'comparison') return rows.length <= 8 ? 'radar' : 'bar';

  // Anomaly → bar (ranked)
  if (intent === 'anomaly_detection') return 'bar';

  // Size heuristics — never return 'table' or 'pie'
  if (rows.length <= 8) return 'radar';
  if (hasTimeColumn(rows)) return 'line';
  return 'bar';
}

// ─── Key Detection ──────────────────────────────────────────────────────────

function detectKeys(rows: Record<string, any>[]): { labelKey: string | null; valueKey: string | null } {
  if (rows.length === 0) return { labelKey: null, valueKey: null };
  const keys = Object.keys(rows[0]);

  const LABEL_CANDIDATES = [
    'label', 'name', 'status', 'stage', 'agent_name', 'module',
    'error_type', 'health_status', 'component', 'campaign_type',
    'temperature', 'level', 'group_val', 'week', 'day', 'hour',
    'entity', 'type', 'category', 'source', 'channel', 'program',
    'cohort', 'department', 'title', 'company', 'industry',
    'first_name', 'last_name', 'email', 'campaign_name', 'agent_type',
  ];
  const VALUE_CANDIDATES = [
    'count', 'total', 'value', 'error_count', 'executions',
    'errors', 'avg_score', 'attendance_count', 'new_leads',
    'new_enrollments', 'campaigns_created', 'activity_count',
    'error_rate_pct', 'avg_duration_ms', 'scored_leads',
    'unique_students', 'event_count', 'risk_score', 'score',
    'anomaly_score', 'similarity', 'amount', 'revenue',
    'conversion_rate', 'open_rate', 'click_rate', 'bounce_rate',
    'run_count', 'success_count', 'fail_count', 'duration',
    'id', 'avg_confidence', 'total_leads', 'total_students',
  ];

  const labelKey = LABEL_CANDIDATES.find((k) => keys.includes(k)) || findStringKey(rows[0], keys);
  const valueKey = VALUE_CANDIDATES.find((k) => keys.includes(k)) || findNumericKey(rows[0], keys);

  return { labelKey: labelKey || null, valueKey: valueKey || null };
}

function findStringKey(row: Record<string, any>, keys: string[]): string | undefined {
  return keys.find((k) => typeof row[k] === 'string' && !k.endsWith('_at') && !k.endsWith('_id'));
}

function findNumericKey(row: Record<string, any>, keys: string[]): string | undefined {
  return keys.find((k) => typeof row[k] === 'number' || (typeof row[k] === 'string' && !isNaN(Number(row[k]))));
}

function hasTimeColumn(rows: Record<string, any>[]): boolean {
  if (rows.length === 0) return false;
  return Object.keys(rows[0]).some((k) => k === 'week' || k === 'day' || k === 'hour' || k.endsWith('_date') || k === 'month' || k === 'date');
}

function formatLabel(val: any): string {
  if (val == null) return 'Unknown';
  if (val instanceof Date) return val.toLocaleDateString();
  const str = String(val);
  if (str.match(/^\d{4}-\d{2}-\d{2}T/)) return str.split('T')[0];
  return str;
}
