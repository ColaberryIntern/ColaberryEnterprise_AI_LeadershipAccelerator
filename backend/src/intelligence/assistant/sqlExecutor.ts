// ─── SQL Executor ──────────────────────────────────────────────────────────
// Executes SQL queries: predefined templates first, LLM-generated SQL fallback.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { Intent } from './intentClassifier';
import { ExecutionPlan } from './planBuilder';
import { chatCompletion } from './openaiHelper';
import DatasetRegistry from '../../models/DatasetRegistry';

export interface SqlResult {
  rows: Record<string, any>[];
  query: string;
  description: string;
  tables: string[];
  method: 'template' | 'llm' | 'fallback';
}

// ─── Safe Query Execution ────────────────────────────────────────────────────

async function executeSQL(sql: string): Promise<Record<string, any>[]> {
  try {
    const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });
    return rows as Record<string, any>[];
  } catch (err: any) {
    console.warn('[SQLExecutor] SQL error:', err?.message?.slice(0, 200));
    return [];
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function executeSQLQueries(
  plan: ExecutionPlan,
  intent: Intent,
  question: string,
  entityType?: string
): Promise<SqlResult[]> {
  if (!plan.sql) return [];

  const results: SqlResult[] = [];

  // Phase 1: Run predefined templates (baseline context)
  const templateResults = buildTemplateQueries(intent, plan.tables, question);
  for (const tq of templateResults) {
    const rows = await executeSQL(tq.sql);
    results.push({ rows, query: tq.sql, description: tq.description, tables: tq.tables, method: 'template' });
  }

  // Phase 2: ALWAYS try LLM-generated SQL for question-specific data
  // Templates provide generic context; LLM SQL targets the user's actual question
  const llmResult = await generateAndExecuteLLMSQL(question, plan.tables, entityType);
  if (llmResult && llmResult.rows.length > 0) {
    results.push(llmResult);
  }

  // Phase 3: Fallback only if NO results at all
  if (results.every((r) => r.rows.length === 0)) {
    const table = plan.tables[0] || 'leads';
    const rows = await executeSQL(`SELECT COUNT(*) AS total FROM "${table}"`);
    results.push({ rows, query: `SELECT COUNT(*) FROM "${table}"`, description: `Total records in ${table}`, tables: [table], method: 'fallback' });
  }

  return results;
}

// ─── Template Queries (carried over from queryBuilder.ts) ────────────────────

interface TemplateQuery {
  sql: string;
  description: string;
  tables: string[];
}

function buildTemplateQueries(intent: Intent, tables: string[], question: string): TemplateQuery[] {
  const builder = QUERY_BUILDERS[intent];
  if (!builder) return [];
  return builder(tables, question);
}

type QueryBuilderFn = (tables: string[], question: string) => TemplateQuery[];

const QUERY_BUILDERS: Record<Intent, QueryBuilderFn> = {
  campaign_analysis: buildCampaignQueries,
  lead_analysis: buildLeadQueries,
  student_analysis: buildStudentQueries,
  agent_analysis: buildAgentQueries,
  anomaly_detection: buildAnomalyQueries,
  forecast_request: buildForecastQueries,
  comparison: buildComparisonQueries,
  root_cause_analysis: buildGeneralQueries,
  text_search: () => [],
  general_insight: buildGeneralQueries,
};

function buildCampaignQueries(tables: string[]): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  if (tables.includes('campaigns')) {
    // Total counts first — contextBuilder uses these for accurate totals
    queries.push({
      sql: `SELECT COUNT(*) AS total_campaigns, COUNT(*) FILTER (WHERE status = 'active') AS active_campaigns, COUNT(*) FILTER (WHERE status = 'paused') AS paused_campaigns, COUNT(*) FILTER (WHERE status = 'completed') AS completed_campaigns FROM campaigns`,
      description: 'Campaign totals by status',
      tables: ['campaigns'],
    });
    queries.push({
      sql: `SELECT COALESCE(status, 'unknown') AS status, COUNT(*) AS count, COALESCE(type, 'unknown') AS campaign_type FROM campaigns GROUP BY status, type ORDER BY count DESC LIMIT 20`,
      description: 'Campaign distribution by status and type',
      tables: ['campaigns'],
    });
  }
  if (tables.includes('campaign_errors')) {
    queries.push({
      sql: `SELECT COALESCE(component, 'unknown') AS component, COALESCE(severity, 'unknown') AS severity, COUNT(*) AS error_count, MAX(created_at) AS last_occurred FROM campaign_errors WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY component, severity ORDER BY error_count DESC LIMIT 10`,
      description: 'Campaign errors in the last 7 days',
      tables: ['campaign_errors'],
    });
  }
  if (tables.includes('campaign_health')) {
    queries.push({
      sql: `SELECT COALESCE(status, 'unknown') AS health_status, COUNT(*) AS count, AVG(health_score) AS avg_health_score FROM campaign_health GROUP BY status ORDER BY count DESC`,
      description: 'Campaign health status distribution',
      tables: ['campaign_health'],
    });
  }
  if (tables.includes('scheduled_emails')) {
    queries.push({
      sql: `SELECT se.status, COUNT(*) AS count, c.name AS campaign_name FROM scheduled_emails se LEFT JOIN campaigns c ON c.id = se.campaign_id GROUP BY se.status, c.name ORDER BY count DESC LIMIT 20`,
      description: 'Scheduled emails by status and campaign',
      tables: ['scheduled_emails', 'campaigns'],
    });
    queries.push({
      sql: `SELECT DATE(COALESCE(se.sent_at, se.created_at)) AS day, COUNT(*) AS emails_sent, c.name AS campaign_name FROM scheduled_emails se LEFT JOIN campaigns c ON c.id = se.campaign_id WHERE se.status = 'sent' AND COALESCE(se.sent_at, se.created_at) >= NOW() - INTERVAL '7 days' GROUP BY day, c.name ORDER BY day DESC LIMIT 30`,
      description: 'Emails sent per day by campaign (last 7 days)',
      tables: ['scheduled_emails', 'campaigns'],
    });
  }
  if (tables.includes('communication_logs')) {
    queries.push({
      sql: `SELECT channel, status, COUNT(*) AS count, DATE(created_at) AS day FROM communication_logs WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY channel, status, DATE(created_at) ORDER BY day DESC, count DESC LIMIT 30`,
      description: 'Communication logs by channel and day (last 7 days)',
      tables: ['communication_logs'],
    });
  }
  return queries;
}

function buildLeadQueries(tables: string[]): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  if (tables.includes('leads')) {
    // Total counts first — contextBuilder uses these for accurate totals
    queries.push({
      sql: `SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE lead_temperature = 'hot') AS hot_leads, COUNT(*) FILTER (WHERE lead_temperature = 'warm') AS warm_leads, COUNT(*) FILTER (WHERE lead_temperature = 'cold') AS cold_leads FROM leads`,
      description: 'Lead totals by temperature',
      tables: ['leads'],
    });
    queries.push({
      sql: `SELECT COALESCE(pipeline_stage, 'unknown') AS stage, COUNT(*) AS count, COALESCE(lead_temperature, 'unknown') AS temperature FROM leads GROUP BY pipeline_stage, lead_temperature ORDER BY count DESC LIMIT 30`,
      description: 'Lead distribution by pipeline stage and temperature',
      tables: ['leads'],
    });
  }
  if (tables.includes('opportunity_scores')) {
    queries.push({
      sql: `SELECT l.pipeline_stage AS stage, AVG(o.score) AS avg_score, COUNT(*) AS scored_leads FROM opportunity_scores o JOIN leads l ON l.id = o.lead_id GROUP BY l.pipeline_stage ORDER BY avg_score DESC LIMIT 10`,
      description: 'Average opportunity score by pipeline stage',
      tables: ['opportunity_scores', 'leads'],
    });
  }
  if (tables.includes('activities')) {
    queries.push({
      sql: `SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS activity_count FROM activities WHERE created_at >= NOW() - INTERVAL '14 days' GROUP BY day ORDER BY day`,
      description: 'Lead activity trend (last 14 days)',
      tables: ['activities'],
    });
  }
  return queries;
}

function buildStudentQueries(tables: string[]): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  if (tables.includes('enrollments')) {
    queries.push({
      sql: `SELECT COALESCE(status, 'unknown') AS status, COUNT(*) AS count FROM enrollments GROUP BY status ORDER BY count DESC`,
      description: 'Enrollment distribution by status',
      tables: ['enrollments'],
    });
  }
  if (tables.includes('attendance_records')) {
    queries.push({
      sql: `SELECT DATE_TRUNC('week', attended_at) AS week, COUNT(*) AS attendance_count, COUNT(DISTINCT student_id) AS unique_students FROM attendance_records WHERE attended_at >= NOW() - INTERVAL '8 weeks' GROUP BY week ORDER BY week`,
      description: 'Attendance trend (last 8 weeks)',
      tables: ['attendance_records'],
    });
  }
  if (tables.includes('skill_mastery')) {
    queries.push({
      sql: `SELECT COALESCE(mastery_level, 'unknown') AS level, COUNT(*) AS count FROM skill_mastery GROUP BY mastery_level ORDER BY count DESC LIMIT 10`,
      description: 'Skill mastery distribution',
      tables: ['skill_mastery'],
    });
  }
  return queries;
}

function buildAgentQueries(tables: string[]): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  if (tables.includes('ai_agents')) {
    // Total counts first — contextBuilder uses these for accurate totals
    queries.push({
      sql: `SELECT COUNT(*) AS total_agents, COUNT(*) FILTER (WHERE status = 'active') AS active_agents, COUNT(*) FILTER (WHERE status = 'idle') AS idle_agents, COUNT(*) FILTER (WHERE status = 'paused') AS paused_agents, COUNT(*) FILTER (WHERE error_count > 0) AS agents_with_errors, COUNT(*) FILTER (WHERE enabled = true) AS enabled_agents FROM ai_agents`,
      description: 'Agent totals by status',
      tables: ['ai_agents'],
    });
    queries.push({
      sql: `SELECT agent_name, COALESCE(status, 'unknown') AS status, COALESCE(agent_type, 'unknown') AS agent_type, last_run_at, error_count, enabled, EXTRACT(EPOCH FROM (NOW() - last_run_at))/3600 AS hours_since_last_run FROM ai_agents ORDER BY error_count DESC NULLS LAST LIMIT 20`,
      description: 'AI agents with error counts and idle time',
      tables: ['ai_agents'],
    });
  }
  if (tables.includes('ai_agent_activity_logs')) {
    queries.push({
      sql: `SELECT a.agent_name, l.result, COUNT(*) AS executions, AVG(l.duration_ms) AS avg_duration_ms, MAX(l.created_at) AS last_execution FROM ai_agent_activity_logs l JOIN ai_agents a ON a.id = l.agent_id WHERE l.created_at >= NOW() - INTERVAL '24 hours' GROUP BY a.agent_name, l.result ORDER BY executions DESC LIMIT 20`,
      description: 'Agent execution summary (last 24 hours)',
      tables: ['ai_agent_activity_logs', 'ai_agents'],
    });
    // Most active agents by total execution volume (7-day window)
    queries.push({
      sql: `SELECT a.agent_name, COUNT(*) AS executions, COUNT(*) FILTER (WHERE l.result = 'success') AS successes, COUNT(*) FILTER (WHERE l.result = 'failed') AS errors, MIN(l.created_at) AS first_run, MAX(l.created_at) AS last_run FROM ai_agent_activity_logs l JOIN ai_agents a ON a.id = l.agent_id WHERE l.created_at >= NOW() - INTERVAL '7 days' GROUP BY a.agent_name ORDER BY executions DESC LIMIT 20`,
      description: 'Most active agents by execution count (last 7 days)',
      tables: ['ai_agent_activity_logs', 'ai_agents'],
    });
  }
  if (tables.includes('orchestration_health')) {
    queries.push({
      sql: `SELECT o.status, o.health_score, o.scan_timestamp, a.agent_name, o.duration_ms FROM orchestration_health o LEFT JOIN ai_agents a ON a.id = o.agent_id ORDER BY o.scan_timestamp DESC NULLS LAST LIMIT 10`,
      description: 'Orchestration health status',
      tables: ['orchestration_health', 'ai_agents'],
    });
  }
  return queries;
}

function buildAnomalyQueries(tables: string[]): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  if (tables.includes('campaign_errors')) {
    queries.push({
      sql: `SELECT DATE_TRUNC('hour', created_at) AS hour, COUNT(*) AS error_count, COALESCE(component, 'unknown') AS component, COALESCE(severity, 'unknown') AS severity FROM campaign_errors WHERE created_at >= NOW() - INTERVAL '48 hours' GROUP BY hour, component, severity ORDER BY hour DESC LIMIT 50`,
      description: 'Campaign error frequency (last 48 hours)',
      tables: ['campaign_errors'],
    });
  }
  if (tables.includes('ai_agent_activity_logs')) {
    queries.push({
      sql: `SELECT a.agent_name, COUNT(*) FILTER (WHERE l.result = 'failed') AS errors, COUNT(*) AS total, ROUND(COUNT(*) FILTER (WHERE l.result = 'failed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS error_rate_pct FROM ai_agent_activity_logs l JOIN ai_agents a ON a.id = l.agent_id WHERE l.created_at >= NOW() - INTERVAL '24 hours' GROUP BY a.agent_name HAVING COUNT(*) FILTER (WHERE l.result = 'failed') > 0 ORDER BY error_rate_pct DESC LIMIT 10`,
      description: 'Agent error rates (last 24 hours)',
      tables: ['ai_agent_activity_logs'],
    });
  }
  if (tables.includes('system_processes')) {
    queries.push({
      sql: `SELECT COALESCE(source_module, 'unknown') AS module, COALESCE(status, 'unknown') AS status, COUNT(*) AS count, AVG(execution_time_ms) AS avg_time_ms, MAX(execution_time_ms) AS max_time_ms FROM system_processes WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY source_module, status ORDER BY count DESC LIMIT 20`,
      description: 'System process status distribution (last 24 hours)',
      tables: ['system_processes'],
    });
  }
  return queries;
}

function buildForecastQueries(tables: string[], question: string): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  const q = question.toLowerCase();
  if (tables.includes('leads') && (q.includes('lead') || !q.includes('enrollment'))) {
    queries.push({
      sql: `SELECT DATE_TRUNC('week', created_at) AS week, COUNT(*) AS new_leads FROM leads WHERE created_at >= NOW() - INTERVAL '12 weeks' GROUP BY week ORDER BY week`,
      description: 'Weekly lead creation trend (12 weeks)',
      tables: ['leads'],
    });
  }
  if (tables.includes('enrollments') && (q.includes('enrollment') || q.includes('student') || !q.includes('lead'))) {
    queries.push({
      sql: `SELECT DATE_TRUNC('week', created_at) AS week, COUNT(*) AS new_enrollments FROM enrollments WHERE created_at >= NOW() - INTERVAL '12 weeks' GROUP BY week ORDER BY week`,
      description: 'Weekly enrollment trend (12 weeks)',
      tables: ['enrollments'],
    });
  }
  if (tables.includes('campaigns')) {
    queries.push({
      sql: `SELECT DATE_TRUNC('week', created_at) AS week, COUNT(*) AS campaigns_created FROM campaigns WHERE created_at >= NOW() - INTERVAL '12 weeks' GROUP BY week ORDER BY week`,
      description: 'Weekly campaign creation trend (12 weeks)',
      tables: ['campaigns'],
    });
  }
  return queries;
}

function buildComparisonQueries(tables: string[]): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  // Multi-entity overview for comparison
  queries.push({
    sql: `SELECT 'leads' AS entity, COUNT(*) AS total FROM leads UNION ALL SELECT 'campaigns', COUNT(*) FROM campaigns UNION ALL SELECT 'enrollments', COUNT(*) FROM enrollments UNION ALL SELECT 'agents', COUNT(*) FROM ai_agents`,
    description: 'Entity count comparison',
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents'],
  });
  if (tables.includes('leads')) {
    queries.push({
      sql: `SELECT COALESCE(pipeline_stage, 'unknown') AS stage, COUNT(*) AS count FROM leads GROUP BY pipeline_stage ORDER BY count DESC LIMIT 10`,
      description: 'Lead pipeline stage distribution',
      tables: ['leads'],
    });
  }
  return queries;
}

function buildGeneralQueries(tables: string[]): TemplateQuery[] {
  const queries: TemplateQuery[] = [];
  queries.push({
    sql: `SELECT (SELECT COUNT(*) FROM leads) AS total_leads, (SELECT COUNT(*) FROM campaigns) AS total_campaigns, (SELECT COUNT(*) FROM enrollments) AS total_enrollments, (SELECT COUNT(*) FROM ai_agents) AS total_agents`,
    description: 'System-wide entity counts',
    tables: ['leads', 'campaigns', 'enrollments', 'ai_agents'],
  });
  if (tables.includes('system_processes')) {
    queries.push({
      sql: `SELECT COALESCE(source_module, 'unknown') AS module, COUNT(*) AS event_count FROM system_processes WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY source_module ORDER BY event_count DESC LIMIT 10`,
      description: 'System activity by module (last 24 hours)',
      tables: ['system_processes'],
    });
  }
  return queries;
}

// ─── LLM SQL Generation ─────────────────────────────────────────────────────

async function generateAndExecuteLLMSQL(
  question: string,
  planTables: string[],
  entityType?: string
): Promise<SqlResult | null> {
  // Load ALL schemas from DatasetRegistry — Cory needs full database visibility
  let primarySchema = '';
  let fullIndex = '';
  let relationshipContext = '';
  try {
    const registries = await DatasetRegistry.findAll({
      where: { status: 'active' },
    });

    // Tier 1: Full column detail for plan-relevant tables
    const primaryTables = registries.filter((r: any) => planTables.includes(r.table_name));
    primarySchema = primaryTables.map((r: any) => {
      const cols = Object.keys(r.semantic_types || {}).join(', ');
      return `Table "${r.table_name}" (${r.row_count} rows): ${cols}`;
    }).join('\n');

    // Tier 2: Compact index of ALL other tables (name + row count + key columns)
    const otherTables = registries.filter((r: any) => !planTables.includes(r.table_name));
    if (otherTables.length > 0) {
      fullIndex = otherTables.map((r: any) => {
        const cols = Object.keys(r.semantic_types || {});
        // Show up to 8 most important columns to keep context manageable
        const keyCols = cols.filter((c: string) =>
          c === 'id' || c.endsWith('_id') || c === 'status' || c === 'name' ||
          c === 'email' || c === 'created_at' || c === 'type' || c === 'channel'
        );
        const preview = keyCols.length > 0 ? keyCols.join(', ') : cols.slice(0, 6).join(', ');
        return `"${r.table_name}" (${r.row_count} rows): ${preview}`;
      }).join('\n');
    }

    // Tier 3: Key relationships from primary tables
    const relLines: string[] = [];
    for (const r of primaryTables as any[]) {
      const rels = r.relationships || [];
      for (const rel of rels) {
        relLines.push(`${rel.source_table}.${rel.source_column} → ${rel.target_table}.${rel.target_column}`);
      }
    }
    if (relLines.length > 0) {
      relationshipContext = [...new Set(relLines)].slice(0, 30).join('\n');
    }
  } catch {
    // Can't load schemas — skip LLM SQL
    return null;
  }

  if (!primarySchema && !fullIndex) return null;

  const system = `You are a PostgreSQL query generator for a business intelligence system.
Generate a single read-only SELECT query to answer the user's question.
Rules:
- Only SELECT statements (no INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE)
- Use COALESCE for nullable columns
- Use LIMIT to cap results
- You have access to ALL tables in the database — use any table needed to answer the question
- Use JOINs when data spans multiple tables; refer to the relationships section for foreign keys
- Return only the SQL, no explanation
- Do not use semicolons`;

  let userPrompt = '';
  if (primarySchema) userPrompt += `PRIMARY TABLES (full schema):\n${primarySchema}\n\n`;
  if (relationshipContext) userPrompt += `RELATIONSHIPS:\n${relationshipContext}\n\n`;
  if (fullIndex) userPrompt += `ALL OTHER TABLES (available for queries):\n${fullIndex}\n\n`;
  if (entityType) userPrompt += `Entity scope: ${entityType}\n\n`;
  userPrompt += `Question: ${question}`;

  // Cap context to avoid excessive token usage
  const user = userPrompt.slice(0, 12000);

  const sql = await chatCompletion(system, user, { maxTokens: 800, temperature: 0.1 });
  if (!sql) return null;

  // Validate the generated SQL
  const cleaned = sql.trim().replace(/;$/, '');
  if (!validateSQL(cleaned)) {
    console.warn('[SQLExecutor] LLM SQL rejected:', cleaned.slice(0, 200));
    return null;
  }

  // Execute with timeout
  try {
    const rows = await sequelize.query(cleaned, {
      type: QueryTypes.SELECT,
      // Set a 10-second timeout for safety
      ...(sequelize.getDialect() === 'postgres' ? { raw: true } : {}),
    });
    return {
      rows: rows as Record<string, any>[],
      query: cleaned,
      description: `AI-generated query for: ${question.slice(0, 100)}`,
      tables: planTables,
      method: 'llm',
    };
  } catch (err: any) {
    console.warn('[SQLExecutor] LLM SQL execution failed:', err?.message?.slice(0, 200));
    return null;
  }
}

function validateSQL(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  // Must start with SELECT or WITH (for CTEs)
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) return false;
  // Must not contain dangerous keywords
  const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC'];
  for (const kw of forbidden) {
    // Check for keyword as a standalone word (not part of column names)
    if (new RegExp(`\\b${kw}\\b`).test(upper)) return false;
  }
  return true;
}
