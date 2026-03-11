// ─── Query Builder ─────────────────────────────────────────────────────────
// Builds deterministic SQL queries based on intent and entity scope.
// No LLM-generated SQL — all queries are predefined templates.

import { Intent } from './intentClassifier';
import { RoutedSources } from './dataSourceRouter';

export interface BuiltQuery {
  sql: string;
  description: string;
  tables: string[];
}

/**
 * Build SQL queries for the given intent.
 * Returns an array of queries to execute (some intents need multiple).
 */
export function buildQueries(
  intent: Intent,
  sources: RoutedSources,
  question: string
): BuiltQuery[] {
  const builder = QUERY_BUILDERS[intent];
  if (!builder) {
    return [fallbackQuery(sources.tables)];
  }
  return builder(sources, question);
}

// ─── Intent-Specific Query Builders ──────────────────────────────────────────

type QueryBuilderFn = (sources: RoutedSources, question: string) => BuiltQuery[];

const QUERY_BUILDERS: Record<Intent, QueryBuilderFn> = {
  campaign_analysis: buildCampaignQueries,
  lead_analysis: buildLeadQueries,
  student_analysis: buildStudentQueries,
  agent_analysis: buildAgentQueries,
  anomaly_detection: buildAnomalyQueries,
  forecast_request: buildForecastQueries,
  general_insight: buildGeneralQueries,
};

function buildCampaignQueries(sources: RoutedSources): BuiltQuery[] {
  const queries: BuiltQuery[] = [];

  if (sources.tables.includes('campaigns')) {
    queries.push({
      sql: `SELECT
        COALESCE(status, 'unknown') AS status,
        COUNT(*) AS count,
        COALESCE(campaign_type, 'unknown') AS campaign_type
      FROM campaigns
      GROUP BY status, campaign_type
      ORDER BY count DESC
      LIMIT 20`,
      description: 'Campaign distribution by status and type',
      tables: ['campaigns'],
    });
  }

  if (sources.tables.includes('campaign_errors')) {
    queries.push({
      sql: `SELECT
        COALESCE(error_type, 'unknown') AS error_type,
        COUNT(*) AS error_count,
        MAX(created_at) AS last_occurred
      FROM campaign_errors
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY error_type
      ORDER BY error_count DESC
      LIMIT 10`,
      description: 'Campaign errors in the last 7 days',
      tables: ['campaign_errors'],
    });
  }

  if (sources.tables.includes('campaign_health')) {
    queries.push({
      sql: `SELECT
        COALESCE(health_status, 'unknown') AS health_status,
        COUNT(*) AS count
      FROM campaign_health
      GROUP BY health_status
      ORDER BY count DESC`,
      description: 'Campaign health status distribution',
      tables: ['campaign_health'],
    });
  }

  return queries.length > 0 ? queries : [fallbackQuery(sources.tables)];
}

function buildLeadQueries(sources: RoutedSources): BuiltQuery[] {
  const queries: BuiltQuery[] = [];

  if (sources.tables.includes('leads')) {
    queries.push({
      sql: `SELECT
        COALESCE(pipeline_stage, 'unknown') AS stage,
        COUNT(*) AS count,
        COALESCE(temperature, 'unknown') AS temperature
      FROM leads
      GROUP BY pipeline_stage, temperature
      ORDER BY count DESC
      LIMIT 30`,
      description: 'Lead distribution by pipeline stage and temperature',
      tables: ['leads'],
    });
  }

  if (sources.tables.includes('opportunity_scores')) {
    queries.push({
      sql: `SELECT
        l.pipeline_stage AS stage,
        AVG(o.score) AS avg_score,
        COUNT(*) AS scored_leads
      FROM opportunity_scores o
      JOIN leads l ON l.id = o.lead_id
      GROUP BY l.pipeline_stage
      ORDER BY avg_score DESC
      LIMIT 10`,
      description: 'Average opportunity score by pipeline stage',
      tables: ['opportunity_scores', 'leads'],
    });
  }

  if (sources.tables.includes('activities')) {
    queries.push({
      sql: `SELECT
        DATE_TRUNC('day', created_at) AS day,
        COUNT(*) AS activity_count
      FROM activities
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY day
      ORDER BY day`,
      description: 'Lead activity trend (last 14 days)',
      tables: ['activities'],
    });
  }

  return queries.length > 0 ? queries : [fallbackQuery(sources.tables)];
}

function buildStudentQueries(sources: RoutedSources): BuiltQuery[] {
  const queries: BuiltQuery[] = [];

  if (sources.tables.includes('enrollments')) {
    queries.push({
      sql: `SELECT
        COALESCE(status, 'unknown') AS status,
        COUNT(*) AS count
      FROM enrollments
      GROUP BY status
      ORDER BY count DESC`,
      description: 'Enrollment distribution by status',
      tables: ['enrollments'],
    });
  }

  if (sources.tables.includes('attendance_records')) {
    queries.push({
      sql: `SELECT
        DATE_TRUNC('week', attended_at) AS week,
        COUNT(*) AS attendance_count,
        COUNT(DISTINCT student_id) AS unique_students
      FROM attendance_records
      WHERE attended_at >= NOW() - INTERVAL '8 weeks'
      GROUP BY week
      ORDER BY week`,
      description: 'Attendance trend (last 8 weeks)',
      tables: ['attendance_records'],
    });
  }

  if (sources.tables.includes('skill_mastery')) {
    queries.push({
      sql: `SELECT
        COALESCE(mastery_level, 'unknown') AS level,
        COUNT(*) AS count
      FROM skill_mastery
      GROUP BY mastery_level
      ORDER BY count DESC
      LIMIT 10`,
      description: 'Skill mastery distribution',
      tables: ['skill_mastery'],
    });
  }

  return queries.length > 0 ? queries : [fallbackQuery(sources.tables)];
}

function buildAgentQueries(sources: RoutedSources): BuiltQuery[] {
  const queries: BuiltQuery[] = [];

  if (sources.tables.includes('ai_agents')) {
    queries.push({
      sql: `SELECT
        agent_name,
        COALESCE(status, 'unknown') AS status,
        COALESCE(agent_type, 'unknown') AS agent_type,
        last_run_at,
        error_count
      FROM ai_agents
      ORDER BY error_count DESC NULLS LAST
      LIMIT 20`,
      description: 'AI agents ranked by error count',
      tables: ['ai_agents'],
    });
  }

  if (sources.tables.includes('ai_agent_activity_logs')) {
    queries.push({
      sql: `SELECT
        COALESCE(agent_name, 'unknown') AS agent_name,
        COALESCE(status, 'unknown') AS status,
        COUNT(*) AS executions,
        AVG(duration_ms) AS avg_duration_ms,
        MAX(created_at) AS last_execution
      FROM ai_agent_activity_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY agent_name, status
      ORDER BY executions DESC
      LIMIT 20`,
      description: 'Agent execution summary (last 24 hours)',
      tables: ['ai_agent_activity_logs'],
    });
  }

  if (sources.tables.includes('orchestration_health')) {
    queries.push({
      sql: `SELECT
        COALESCE(component, 'unknown') AS component,
        COALESCE(status, 'unknown') AS health_status,
        last_check_at,
        error_message
      FROM orchestration_health
      ORDER BY last_check_at DESC NULLS LAST
      LIMIT 10`,
      description: 'Orchestration health status',
      tables: ['orchestration_health'],
    });
  }

  return queries.length > 0 ? queries : [fallbackQuery(sources.tables)];
}

function buildAnomalyQueries(sources: RoutedSources): BuiltQuery[] {
  const queries: BuiltQuery[] = [];

  // Look for error spikes
  if (sources.tables.includes('campaign_errors')) {
    queries.push({
      sql: `SELECT
        DATE_TRUNC('hour', created_at) AS hour,
        COUNT(*) AS error_count,
        COALESCE(error_type, 'unknown') AS error_type
      FROM campaign_errors
      WHERE created_at >= NOW() - INTERVAL '48 hours'
      GROUP BY hour, error_type
      ORDER BY hour DESC
      LIMIT 50`,
      description: 'Campaign error frequency (last 48 hours)',
      tables: ['campaign_errors'],
    });
  }

  // Agent failures
  if (sources.tables.includes('ai_agent_activity_logs')) {
    queries.push({
      sql: `SELECT
        COALESCE(agent_name, 'unknown') AS agent_name,
        COUNT(*) FILTER (WHERE status = 'error') AS errors,
        COUNT(*) AS total,
        ROUND(COUNT(*) FILTER (WHERE status = 'error')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS error_rate_pct
      FROM ai_agent_activity_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY agent_name
      HAVING COUNT(*) FILTER (WHERE status = 'error') > 0
      ORDER BY error_rate_pct DESC
      LIMIT 10`,
      description: 'Agent error rates (last 24 hours)',
      tables: ['ai_agent_activity_logs'],
    });
  }

  // System process anomalies
  if (sources.tables.includes('system_processes')) {
    queries.push({
      sql: `SELECT
        COALESCE(source_module, 'unknown') AS module,
        COALESCE(status, 'unknown') AS status,
        COUNT(*) AS count,
        AVG(execution_time_ms) AS avg_time_ms,
        MAX(execution_time_ms) AS max_time_ms
      FROM system_processes
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY source_module, status
      ORDER BY count DESC
      LIMIT 20`,
      description: 'System process status distribution (last 24 hours)',
      tables: ['system_processes'],
    });
  }

  return queries.length > 0 ? queries : [fallbackQuery(sources.tables)];
}

function buildForecastQueries(sources: RoutedSources, question: string): BuiltQuery[] {
  const queries: BuiltQuery[] = [];
  const q = question.toLowerCase();

  // Lead trend for forecasting
  if (sources.tables.includes('leads') && (q.includes('lead') || !q.includes('enrollment'))) {
    queries.push({
      sql: `SELECT
        DATE_TRUNC('week', created_at) AS week,
        COUNT(*) AS new_leads
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY week
      ORDER BY week`,
      description: 'Weekly lead creation trend (12 weeks)',
      tables: ['leads'],
    });
  }

  // Enrollment trend
  if (sources.tables.includes('enrollments') && (q.includes('enrollment') || q.includes('student') || !q.includes('lead'))) {
    queries.push({
      sql: `SELECT
        DATE_TRUNC('week', created_at) AS week,
        COUNT(*) AS new_enrollments
      FROM enrollments
      WHERE created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY week
      ORDER BY week`,
      description: 'Weekly enrollment trend (12 weeks)',
      tables: ['enrollments'],
    });
  }

  // Campaign activity trend
  if (sources.tables.includes('campaigns')) {
    queries.push({
      sql: `SELECT
        DATE_TRUNC('week', created_at) AS week,
        COUNT(*) AS campaigns_created
      FROM campaigns
      WHERE created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY week
      ORDER BY week`,
      description: 'Weekly campaign creation trend (12 weeks)',
      tables: ['campaigns'],
    });
  }

  return queries.length > 0 ? queries : [fallbackQuery(sources.tables)];
}

function buildGeneralQueries(sources: RoutedSources): BuiltQuery[] {
  const queries: BuiltQuery[] = [];

  // Overview counts
  queries.push({
    sql: `SELECT
      (SELECT COUNT(*) FROM leads) AS total_leads,
      (SELECT COUNT(*) FROM campaigns) AS total_campaigns,
      (SELECT COUNT(*) FROM enrollments) AS total_enrollments,
      (SELECT COUNT(*) FROM ai_agents) AS total_agents`,
    description: 'System-wide entity counts',
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents'],
  });

  // Recent activity
  if (sources.tables.includes('system_processes')) {
    queries.push({
      sql: `SELECT
        COALESCE(source_module, 'unknown') AS module,
        COUNT(*) AS event_count
      FROM system_processes
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY source_module
      ORDER BY event_count DESC
      LIMIT 10`,
      description: 'System activity by module (last 24 hours)',
      tables: ['system_processes'],
    });
  }

  return queries;
}

function fallbackQuery(tables: string[]): BuiltQuery {
  const table = tables[0] || 'leads';
  return {
    sql: `SELECT COUNT(*) AS total FROM "${table}"`,
    description: `Total record count from ${table}`,
    tables: [table],
  };
}
