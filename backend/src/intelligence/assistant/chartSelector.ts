// ─── Chart Selector ──────────────────────────────────────────────────────
// Selects chart types based on intent + data shape. Guarantees minimum charts
// with variety — never returns empty, never all-bar.

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

// Chart types to rotate through for variety (order matters — preferred first)
const VARIETY_ROTATION: ChartType[] = ['bar', 'radar', 'line', 'combo', 'waterfall'];

/**
 * Select and configure visualizations from query results.
 * Returns max 4 charts. Skips single-row aggregates (those become KPIs).
 */
export function selectVisualizations(
  intent: Intent,
  sqlResults: SqlResult[],
  mlResults: MlResult[],
  vectorResults: VectorResult[]
): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const usedTypes = new Set<ChartType>();

  // SQL-based charts — skip single-row aggregates (better as KPIs)
  for (const sr of sqlResults) {
    if (sr.rows.length <= 1) continue; // Skip aggregates like { total: 849 }
    if (charts.length >= 4) break;

    const { labelKey, valueKey } = detectKeys(sr.rows);

    if (!labelKey || !valueKey) {
      // Fallback: find any string + numeric key pair
      const fallbackLabel = findStringKey(sr.rows[0], Object.keys(sr.rows[0])) || Object.keys(sr.rows[0])[0];
      const fallbackValue = findNumericKey(sr.rows[0], Object.keys(sr.rows[0])) || Object.keys(sr.rows[0])[1] || Object.keys(sr.rows[0])[0];
      const chartType = pickVariedType(usedTypes, sr.rows.length, sr.description);
      usedTypes.add(chartType);
      charts.push({
        type: chartType,
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

    const chartType = pickVariedType(usedTypes, sr.rows.length, sr.description, intent);
    usedTypes.add(chartType);
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
 * Guarantee at least 2 charts. Synthesizes from SQL data if needed.
 * Also includes single-row aggregates as simple bar charts if we're under the minimum.
 */
export function guaranteeCharts(
  charts: ChartConfig[],
  intent: Intent,
  sqlResults: SqlResult[]
): ChartConfig[] {
  if (charts.length >= 2) return charts;

  const usedTypes = new Set(charts.map((c) => c.type));

  // First: try multi-row results we might have missed
  for (const sr of sqlResults) {
    if (sr.rows.length <= 1 || charts.length >= 4) continue;
    const keys = Object.keys(sr.rows[0]);
    const stringKey = keys.find((k) => typeof sr.rows[0][k] === 'string' && !k.endsWith('_at') && !k.endsWith('_id'));
    const numericKey = keys.find((k) => typeof sr.rows[0][k] === 'number');
    if (!stringKey || !numericKey) continue;

    // Check if we already have a chart with similar data
    const alreadyUsed = charts.some((c) => c.title === sr.description);
    if (alreadyUsed) continue;

    const selectedType = pickVariedType(usedTypes, sr.rows.length, sr.description);
    usedTypes.add(selectedType);

    charts.push({
      type: selectedType,
      title: sr.description,
      data: sr.rows.slice(0, 10).map((r) => ({
        label: formatLabel(r[stringKey]),
        value: Number(r[numericKey]) || 0,
      })),
      labelKey: 'label',
      valueKey: 'value',
    });
  }

  // Second: if still under 2, use single-row aggregates as bar charts
  if (charts.length < 2) {
    for (const sr of sqlResults) {
      if (sr.rows.length !== 1 || charts.length >= 4) continue;
      const row = sr.rows[0];
      const numericEntries = Object.entries(row).filter(([, v]) => typeof v === 'number' && v > 0);
      if (numericEntries.length === 0) continue;

      charts.push({
        type: 'bar',
        title: sr.description,
        data: numericEntries.map(([k, v]) => ({
          label: k.replace(/_/g, ' '),
          value: Number(v),
        })),
        labelKey: 'label',
        valueKey: 'value',
      });
    }
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
      const selectedType = pickVariedType(usedTypes, summaryData.length, 'summary');
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

// ─── Chart Type Selection with Variety ──────────────────────────────────────

/**
 * Pick a chart type that provides variety. Avoids repeating types already used.
 */
function pickVariedType(
  usedTypes: Set<ChartType>,
  rowCount: number,
  description: string,
  intent?: Intent
): ChartType {
  const desc = description.toLowerCase();

  // Strong signal overrides — always use these types
  if (desc.includes('trend') || desc.includes('weekly') || desc.includes('daily') || desc.includes('over time')) return 'line';
  if (desc.includes('breakdown') || desc.includes('contribution')) return 'waterfall';
  if (intent === 'forecast_request') return 'line';

  // Determine the ideal type based on data shape
  let ideal: ChartType;
  if (rowCount <= 6) {
    ideal = 'radar';
  } else if (rowCount <= 20) {
    ideal = 'bar';
  } else {
    ideal = 'line';
  }

  // If ideal type already used, pick the next unused type from the rotation
  if (usedTypes.has(ideal)) {
    const alternative = VARIETY_ROTATION.find((t) => !usedTypes.has(t));
    if (alternative) return alternative;
  }

  return ideal;
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
