// ─── Chart Validation Agent ─────────────────────────────────────────────────
// Deterministic validation agent that ensures every chart has the correct type
// for its data shape and the correct config keys for its frontend component.
// No LLM calls — pure functions, <2ms latency.

import { ChartConfig, ChartType } from '../chartSelector';
import { SqlResult } from '../sqlExecutor';
import { getBusinessLabel } from './dataAnalystAgent';

// ─── Config Key Maps ────────────────────────────────────────────────────────
// Each frontend chart component reads DIFFERENT config property names.
// This map ensures we send ALL the keys each component needs.

type ConfigBuilder = (labelKey: string, valueKey: string, allNumericKeys?: string[]) => Record<string, any>;

const CONFIG_KEY_MAP: Record<string, ConfigBuilder> = {
  bar: (l, v) => ({
    x_axis: l, xKey: l, category: l,
    y_axes: [v], bars: [v],
  }),
  radar: (l, v, nums) => ({
    angle_key: l, category: l,
    value_keys: nums && nums.length > 1 ? nums : [v],
    series: nums && nums.length > 1 ? nums : [v],
  }),
  line: (l, v, nums) => ({
    x_axis: l, xKey: l,
    y_axes: nums && nums.length > 1 ? nums : [v],
    lines: nums && nums.length > 1 ? nums : [v],
  }),
  combo: (l, v, nums) => ({
    x_axis: l,
    bar_keys: [v], bars: [v],
    line_keys: nums && nums.length > 1 ? [nums[1]] : [],
    lines: nums && nums.length > 1 ? [nums[1]] : [],
  }),
  waterfall: (l, v) => ({
    label_key: l, category: l,
    value_key: v, value: v,
  }),
  heatmap: (l, v) => ({
    row_key: l, y: l,
    col_key: l, x: l,
    value_key: v, value: v,
  }),
  scatter: (l, v) => ({
    x_axis: l, x: l,
    y_axis: v, y: v,
  }),
  risk_matrix: (l, v) => ({
    x_axis: l, x: l,
    y_axis: v, y: v,
  }),
  treemap: (l, v) => ({
    label_key: l, value_key: v,
  }),
  funnel: (l, v) => ({
    label_key: l, value_key: v,
  }),
  network: (l, v) => ({
    label_key: l, value_key: v,
  }),
  forecast_cone: (l, v) => ({
    x_axis: l, date_key: l,
    forecast_key: v, forecast: v,
  }),
  cluster: (l, v) => ({
    x_axis: l, x: l,
    y_axis: v, y: v,
    cluster_key: 'cluster_id', cluster: 'cluster_id',
  }),
  geo: (l, v) => ({
    label_key: l, value_key: v,
  }),
  decomposition_tree: (l, v) => ({
    label_key: l, value_key: v,
  }),
};

// ─── Data Shape Rules ───────────────────────────────────────────────────────

interface ShapeRule {
  minRows: number;
  maxRows: number;
  minNumericCols: number;
}

const SHAPE_RULES: Record<string, ShapeRule> = {
  radar:     { minRows: 3, maxRows: 8,    minNumericCols: 1 },
  line:      { minRows: 4, maxRows: 9999, minNumericCols: 1 },
  waterfall: { minRows: 3, maxRows: 15,   minNumericCols: 1 },
  heatmap:   { minRows: 4, maxRows: 9999, minNumericCols: 1 },
  combo:     { minRows: 4, maxRows: 9999, minNumericCols: 2 },
  scatter:   { minRows: 3, maxRows: 9999, minNumericCols: 2 },
  bar:       { minRows: 1, maxRows: 9999, minNumericCols: 1 },
};

// ─── Public API ─────────────────────────────────────────────────────────────

export function validateAndFixCharts(
  charts: ChartConfig[],
  sqlResults: SqlResult[]
): ChartConfig[] {
  try {
    let validated = charts
      .map(validateChartDataFit)
      .map(normalizeConfigKeys)
      .map(applyBusinessTitles);

    validated = removeEmptyCharts(validated);
    validated = ensureMinimumCharts(validated, sqlResults);

    return validated.slice(0, 4);
  } catch {
    // Fail-safe: return unmodified charts
    return charts;
  }
}

// ─── Internal Functions ─────────────────────────────────────────────────────

/**
 * Validate that chart type matches its data shape. Demote to 'bar' if not.
 */
function validateChartDataFit(chart: ChartConfig): ChartConfig {
  const rule = SHAPE_RULES[chart.type];
  if (!rule) return chart; // Unknown type — pass through

  const rowCount = chart.data.length;
  const numericCols = countNumericColumns(chart.data);

  // Check row count bounds
  if (rowCount < rule.minRows || rowCount > rule.maxRows) {
    return { ...chart, type: 'bar' as ChartType };
  }

  // Check minimum numeric columns
  if (numericCols < rule.minNumericCols) {
    return { ...chart, type: 'bar' as ChartType };
  }

  return chart;
}

/**
 * Normalize config keys to match the frontend component's expectations.
 * This is the CORE fix for empty-rendering charts.
 */
function normalizeConfigKeys(chart: ChartConfig): ChartConfig {
  const builder = CONFIG_KEY_MAP[chart.type] || CONFIG_KEY_MAP.bar;
  const allNumericKeys = chart.data.length > 0
    ? Object.keys(chart.data[0]).filter((k) => typeof chart.data[0][k] === 'number')
    : [chart.valueKey];

  const normalizedConfig = builder(chart.labelKey, chart.valueKey, allNumericKeys);

  return {
    ...chart,
    // Merge normalized keys with any existing config
    // The spread preserves labelKey/valueKey for backward compatibility
    ...({ _normalizedConfig: normalizedConfig } as any),
  };
}

/**
 * Apply business-friendly titles to charts.
 */
function applyBusinessTitles(chart: ChartConfig): ChartConfig {
  let title = chart.title;

  // Replace common technical description patterns
  title = title
    .replace(/^SELECT .*/i, 'Data Overview')
    .replace(/^COUNT .*/i, 'Summary')
    .replace(/query\s*\d*/gi, 'Analysis');

  // If title is too short or generic, enhance it
  if (title.length < 5 || title.toLowerCase() === 'data') {
    const labelBiz = getBusinessLabel(chart.labelKey);
    const valueBiz = getBusinessLabel(chart.valueKey);
    title = `${valueBiz} by ${labelBiz}`;
  }

  return { ...chart, title };
}

/**
 * Remove charts with empty or all-zero data.
 */
function removeEmptyCharts(charts: ChartConfig[]): ChartConfig[] {
  return charts.filter((chart) => {
    if (!chart.data || chart.data.length === 0) return false;

    // Check if all values are 0
    const allZero = chart.data.every((row) => {
      const val = row[chart.valueKey];
      return val === 0 || val === null || val === undefined;
    });

    return !allZero;
  });
}

/**
 * Ensure minimum 2 charts. Synthesize from SQL if needed.
 */
function ensureMinimumCharts(charts: ChartConfig[], sqlResults: SqlResult[]): ChartConfig[] {
  if (charts.length >= 2) return charts;

  const usedDescriptions = new Set(charts.map((c) => c.title));

  for (const sr of sqlResults) {
    if (sr.rows.length < 2 || charts.length >= 4) continue;
    if (usedDescriptions.has(sr.description)) continue;

    const keys = Object.keys(sr.rows[0]);
    const stringKey = keys.find((k) => typeof sr.rows[0][k] === 'string' && !k.endsWith('_at') && !k.endsWith('_id'));
    const numericKey = keys.find((k) => typeof sr.rows[0][k] === 'number' && sr.rows[0][k] > 0);

    if (!stringKey || !numericKey) continue;

    charts.push({
      type: 'bar',
      title: sr.description,
      data: sr.rows.slice(0, 15).map((r) => ({
        label: String(r[stringKey] || 'Unknown'),
        value: Number(r[numericKey]) || 0,
      })),
      labelKey: 'label',
      valueKey: 'value',
    });
  }

  return charts;
}

/**
 * Count numeric columns in the first row of data.
 */
function countNumericColumns(data: Record<string, any>[]): number {
  if (data.length === 0) return 0;
  return Object.values(data[0]).filter((v) => typeof v === 'number').length;
}

/**
 * Extract the normalized config from a chart (used by queryEngine when building response).
 */
export function extractNormalizedConfig(chart: ChartConfig): Record<string, any> {
  const normalized = (chart as any)._normalizedConfig;
  if (normalized) return normalized;
  // Fallback: build bar config
  const builder = CONFIG_KEY_MAP.bar;
  return builder(chart.labelKey, chart.valueKey);
}
