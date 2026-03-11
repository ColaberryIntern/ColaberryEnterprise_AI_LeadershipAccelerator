// ─── Visualization Builder ─────────────────────────────────────────────────
// Deterministic chart type selection and config generation.

import { Intent } from './intentClassifier';
import { BuiltQuery } from './queryBuilder';

export interface ChartConfig {
  chart_type: 'bar' | 'line' | 'pie' | 'heatmap' | 'table';
  title: string;
  data: Record<string, any>[];
  config: {
    label_key: string;
    value_key: string;
    series_key?: string;
  };
}

/**
 * Build visualizations from query results.
 * Chart type is determined by intent + data shape — no LLM.
 */
export function buildVisualizations(
  intent: Intent,
  queryResults: { query: BuiltQuery; rows: Record<string, any>[] }[]
): ChartConfig[] {
  const charts: ChartConfig[] = [];

  for (const { query, rows } of queryResults) {
    if (rows.length === 0) continue;

    const chartType = selectChartType(intent, query, rows);
    const { labelKey, valueKey } = detectKeys(rows);

    if (!labelKey || !valueKey) {
      // Fall back to table view
      charts.push({
        chart_type: 'table',
        title: query.description,
        data: rows.slice(0, 20),
        config: { label_key: Object.keys(rows[0])[0], value_key: Object.keys(rows[0])[1] || Object.keys(rows[0])[0] },
      });
      continue;
    }

    charts.push({
      chart_type: chartType,
      title: query.description,
      data: rows.map((r) => ({
        label: formatLabel(r[labelKey]),
        value: Number(r[valueKey]) || 0,
      })),
      config: { label_key: 'label', value_key: 'value' },
    });
  }

  return charts;
}

// ─── Chart Type Selection ────────────────────────────────────────────────────

function selectChartType(
  intent: Intent,
  query: BuiltQuery,
  rows: Record<string, any>[]
): ChartConfig['chart_type'] {
  const desc = query.description.toLowerCase();

  // Trend/time-series queries → line chart
  if (desc.includes('trend') || desc.includes('weekly') || desc.includes('daily')) {
    return 'line';
  }
  if (hasTimeColumn(rows)) {
    return 'line';
  }

  // Distribution/grouping → bar chart
  if (desc.includes('distribution') || desc.includes('by status') || desc.includes('by type')) {
    return rows.length <= 6 ? 'pie' : 'bar';
  }

  // Anomaly/error data → bar (ranked)
  if (intent === 'anomaly_detection') {
    return 'bar';
  }

  // Forecast → line
  if (intent === 'forecast_request') {
    return 'line';
  }

  // Few categories → pie, many → bar
  if (rows.length <= 5) return 'pie';
  if (rows.length <= 30) return 'bar';
  return 'table';
}

// ─── Key Detection ───────────────────────────────────────────────────────────

function detectKeys(rows: Record<string, any>[]): { labelKey: string | null; valueKey: string | null } {
  if (rows.length === 0) return { labelKey: null, valueKey: null };

  const keys = Object.keys(rows[0]);

  // Prefer known label columns
  const LABEL_CANDIDATES = [
    'label', 'name', 'status', 'stage', 'agent_name', 'module',
    'error_type', 'health_status', 'component', 'campaign_type',
    'temperature', 'level', 'group_val', 'week', 'day', 'hour',
  ];

  // Prefer known value columns
  const VALUE_CANDIDATES = [
    'count', 'total', 'value', 'error_count', 'executions',
    'errors', 'avg_score', 'attendance_count', 'new_leads',
    'new_enrollments', 'campaigns_created', 'activity_count',
    'error_rate_pct', 'avg_duration_ms', 'scored_leads',
    'unique_students', 'event_count',
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
  return Object.keys(rows[0]).some((k) => k === 'week' || k === 'day' || k === 'hour' || k.endsWith('_date'));
}

function formatLabel(val: any): string {
  if (val == null) return 'Unknown';
  if (val instanceof Date) return val.toLocaleDateString();
  const str = String(val);
  // Truncate ISO dates to just the date portion
  if (str.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return str.split('T')[0];
  }
  return str;
}
