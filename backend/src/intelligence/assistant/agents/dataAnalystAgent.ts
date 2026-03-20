// ─── Data Analyst Agent ─────────────────────────────────────────────────────
// Deterministic validation agent that enriches SQL results with business labels,
// coerces PostgreSQL string-typed numbers, filters garbage rows, and translates
// raw column names in insights to business language.
// No LLM calls — pure functions, <2ms latency.

import { SqlResult } from '../sqlExecutor';
import { Insight } from '../contextBuilder';

// ─── Business Label Dictionary ──────────────────────────────────────────────
// Maps raw database column names → human-readable business labels.
// If a column is not in this dictionary, Title Case fallback is applied.

const BUSINESS_DICTIONARY: Record<string, string> = {
  // ── Counts & Totals
  total_count: 'Total Count',
  count: 'Count',
  lead_count: 'Total Leads',
  total_leads: 'Total Leads',
  enrollment_count: 'Total Enrollments',
  total_enrollments: 'Total Enrollments',
  total_students: 'Total Students',
  campaign_count: 'Active Campaigns',
  email_count: 'Emails Sent',
  event_count: 'Total Events',
  activity_count: 'Activity Count',
  run_count: 'Total Runs',
  success_count: 'Successful Runs',
  fail_count: 'Failed Runs',
  error_count: 'Errors',
  executions: 'Total Executions',
  attendance_count: 'Attendance Count',
  unique_students: 'Unique Students',
  scored_leads: 'Scored Leads',
  new_leads: 'New Leads',
  new_enrollments: 'New Enrollments',
  campaigns_created: 'Campaigns Created',
  touchpoints: 'Touchpoints',

  // ── Rates & Scores
  avg_score: 'Average Score',
  avg_confidence: 'Average Confidence',
  conversion_rate: 'Conversion Rate',
  open_rate: 'Open Rate',
  click_rate: 'Click Rate',
  bounce_rate: 'Bounce Rate',
  error_rate_pct: 'Error Rate (%)',
  risk_score: 'Risk Score',
  score: 'Score',
  anomaly_score: 'Anomaly Score',
  similarity: 'Similarity',
  avg_duration_ms: 'Avg Duration (ms)',
  duration: 'Duration',

  // ── Financial
  amount: 'Amount',
  revenue: 'Revenue',
  total_revenue: 'Total Revenue',

  // ── Entity Fields
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
  industry: 'Industry',
  title: 'Title',
  name: 'Name',
  agent_name: 'Agent Name',
  agent_type: 'Agent Type',
  campaign_name: 'Campaign Name',
  campaign_type: 'Campaign Type',
  program_name: 'Program',
  cohort: 'Cohort',
  department: 'Department',

  // ── Status & Classification
  status: 'Status',
  stage: 'Stage',
  source: 'Source',
  channel: 'Channel',
  type: 'Type',
  category: 'Category',
  level: 'Level',
  health_status: 'Health Status',
  temperature: 'Temperature',
  component: 'Component',
  module: 'Module',
  error_type: 'Error Type',
  group_val: 'Group',

  // ── Time Fields
  week: 'Week',
  day: 'Day',
  hour: 'Hour',
  month: 'Month',
  date: 'Date',
  created_at: 'Date Created',
  updated_at: 'Last Updated',
  sent_at: 'Sent Date',
  scheduled_at: 'Scheduled Date',
  completed_at: 'Completed Date',

  // ── Misc
  label: 'Label',
  value: 'Value',
  total: 'Total',
  errors: 'Errors',
  entity: 'Entity',
};

// Columns to strip from chart data (not useful for display)
const STRIP_COLUMNS = new Set(['id', 'uuid', 'created_by', 'updated_by', 'deleted_at']);

// ─── Public API ─────────────────────────────────────────────────────────────

export function validateAndEnrichResults(
  sqlResults: SqlResult[],
  insights: Insight[]
): { sqlResults: SqlResult[]; insights: Insight[] } {
  try {
    const enrichedSql = sqlResults.map((sr) => ({
      ...sr,
      rows: filterGarbageRows(
        coerceNumericStrings(
          stripInternalColumns(sr.rows)
        )
      ),
    }));
    const enrichedInsights = enrichInsightLabels(insights);
    return { sqlResults: enrichedSql, insights: enrichedInsights };
  } catch {
    // Fail-safe: return unmodified data
    return { sqlResults, insights };
  }
}

/**
 * Apply business labels to row keys for chart display.
 * Called by chartValidationAgent when building final chart data.
 */
export function applyBusinessLabels(rows: Record<string, any>[]): Record<string, any>[] {
  if (rows.length === 0) return rows;
  return rows.map((row) => {
    const labeled: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      labeled[key] = val; // Keep original keys for config references
    }
    return labeled;
  });
}

/**
 * Translate a raw column name to a business-friendly label.
 */
export function getBusinessLabel(columnName: string): string {
  if (BUSINESS_DICTIONARY[columnName]) {
    return BUSINESS_DICTIONARY[columnName];
  }
  // Fallback: Title Case with underscores replaced
  return columnName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Internal Functions ─────────────────────────────────────────────────────

/**
 * Coerce PostgreSQL string-typed numbers (bigint COUNT, SUM) to actual numbers.
 */
function coerceNumericStrings(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map((row) => {
    const coerced: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      if (typeof val === 'string' && val !== '' && !isNaN(Number(val)) && isFinite(Number(val))) {
        // Check it's not a name/email/status that happens to be numeric-looking
        if (key.endsWith('_count') || key.endsWith('_total') || key === 'count' || key === 'total'
          || key === 'value' || key === 'amount' || key === 'revenue' || key === 'score'
          || key.endsWith('_rate') || key.startsWith('avg_') || key.startsWith('total_')
          || key === 'executions' || key === 'errors' || key === 'duration'
          || key.endsWith('_score') || key.endsWith('_pct') || key === 'id') {
          coerced[key] = Number(val);
        } else {
          coerced[key] = val;
        }
      } else {
        coerced[key] = val;
      }
    }
    return coerced;
  });
}

/**
 * Remove rows where ALL numeric values are 0 or null.
 */
function filterGarbageRows(rows: Record<string, any>[]): Record<string, any>[] {
  if (rows.length === 0) return rows;
  return rows.filter((row) => {
    const numericValues = Object.entries(row)
      .filter(([, v]) => typeof v === 'number')
      .map(([, v]) => v as number);
    // Keep rows that have at least one positive numeric value, or no numeric columns at all
    if (numericValues.length === 0) return true;
    return numericValues.some((v) => v > 0);
  });
}

/**
 * Strip internal columns that aren't useful for display.
 */
function stripInternalColumns(rows: Record<string, any>[]): Record<string, any>[] {
  if (rows.length === 0) return rows;
  const keysToStrip = Object.keys(rows[0]).filter((k) =>
    STRIP_COLUMNS.has(k) || (k.endsWith('_id') && k !== 'cluster_id')
  );
  if (keysToStrip.length === 0) return rows;
  return rows.map((row) => {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      if (!keysToStrip.includes(key)) {
        cleaned[key] = val;
      }
    }
    return cleaned;
  });
}

/**
 * Replace raw metric names in insight messages with business-friendly labels.
 */
function enrichInsightLabels(insights: Insight[]): Insight[] {
  return insights.map((insight) => {
    let message = insight.message;
    let metric = insight.metric;

    // Replace raw column names in the message
    for (const [raw, label] of Object.entries(BUSINESS_DICTIONARY)) {
      // Only replace if it appears as a standalone term (not inside a word)
      const pattern = new RegExp(`\\b${raw.replace(/_/g, '[_ ]')}\\b`, 'gi');
      message = message.replace(pattern, label);
    }

    // Also translate the metric field itself for KPI display
    if (metric && BUSINESS_DICTIONARY[metric]) {
      metric = BUSINESS_DICTIONARY[metric];
    }

    return { ...insight, message, metric };
  });
}
