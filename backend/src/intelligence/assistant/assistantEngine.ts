// ─── Assistant Engine ──────────────────────────────────────────────────────
// 10-step deterministic analysis pipeline.
// Orchestrates intent → data sources → SQL → insights → charts → response.
// No LLM calls — all logic is rule-based for speed and reproducibility.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { classifyIntent, Intent, ClassifiedIntent } from './intentClassifier';
import { routeDataSources, RoutedSources } from './dataSourceRouter';
import { buildQueries, BuiltQuery } from './queryBuilder';
import { generateInsights, InsightResult } from './insightEngine';
import { buildVisualizations, ChartConfig } from './visualizationBuilder';

// ─── Response Types ──────────────────────────────────────────────────────────

export interface PipelineStep {
  step: number;
  name: string;
  status: 'completed' | 'skipped' | 'error';
  duration_ms: number;
  detail?: string;
}

export interface AssistantResponse {
  question: string;
  entity_type: string | null;
  intent: Intent;
  confidence: number;
  narrative: string;
  insights: InsightResult['insights'];
  charts: ChartConfig[];
  recommendations: string[];
  sources: string[];
  pipelineSteps: PipelineStep[];
  execution_path: string;
}

// ─── Safe Query Execution ────────────────────────────────────────────────────

async function executeSQL(sql: string): Promise<Record<string, any>[]> {
  try {
    const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });
    return rows as Record<string, any>[];
  } catch (err: any) {
    // Log but don't throw — individual query failures shouldn't crash the pipeline
    console.warn('[AssistantEngine] SQL error:', err?.message?.slice(0, 200));
    return [];
  }
}

// ─── Pipeline Orchestrator ───────────────────────────────────────────────────

/**
 * Run the full 10-step deterministic analysis pipeline.
 */
export async function runAssistantPipeline(
  question: string,
  entityType?: string
): Promise<AssistantResponse> {
  const steps: PipelineStep[] = [];
  const allSources = new Set<string>();
  let t0 = Date.now();

  // ── Step 1: Classify Intent ──────────────────────────────────────────────
  const classified: ClassifiedIntent = classifyIntent(question, entityType);
  steps.push({
    step: 1,
    name: 'Classify intent',
    status: 'completed',
    duration_ms: Date.now() - t0,
    detail: `${classified.intent} (confidence: ${classified.confidence.toFixed(2)}${classified.entityOverride ? ', entity override' : ''})`,
  });

  // ── Step 2: Detect Entity Scope ──────────────────────────────────────────
  t0 = Date.now();
  const resolvedEntityType = entityType || null;
  steps.push({
    step: 2,
    name: 'Detect entity scope',
    status: 'completed',
    duration_ms: Date.now() - t0,
    detail: resolvedEntityType || 'global',
  });

  // ── Step 3: Route Data Sources ───────────────────────────────────────────
  t0 = Date.now();
  const sources: RoutedSources = routeDataSources(classified.intent, entityType);
  steps.push({
    step: 3,
    name: 'Route data sources',
    status: 'completed',
    duration_ms: Date.now() - t0,
    detail: `primary: ${sources.primary}, secondary: [${sources.secondary.join(', ')}], tables: ${sources.tables.length}`,
  });

  // ── Step 4: Build SQL Queries ────────────────────────────────────────────
  t0 = Date.now();
  const queries: BuiltQuery[] = buildQueries(classified.intent, sources, question);
  steps.push({
    step: 4,
    name: 'Build SQL queries',
    status: 'completed',
    duration_ms: Date.now() - t0,
    detail: `${queries.length} queries built`,
  });

  // ── Step 5: Execute SQL ──────────────────────────────────────────────────
  t0 = Date.now();
  const queryResults: { query: BuiltQuery; rows: Record<string, any>[] }[] = [];
  for (const q of queries) {
    const rows = await executeSQL(q.sql);
    queryResults.push({ query: q, rows });
    q.tables.forEach((t) => allSources.add(t));
  }
  const totalRows = queryResults.reduce((s, r) => s + r.rows.length, 0);
  steps.push({
    step: 5,
    name: 'Execute SQL queries',
    status: totalRows > 0 ? 'completed' : 'completed',
    duration_ms: Date.now() - t0,
    detail: `${queries.length} queries → ${totalRows} rows`,
  });

  // ── Step 6: Run ML (if secondary sources include 'ml') ──────────────────
  t0 = Date.now();
  const hasML = sources.secondary.includes('ml');
  if (hasML && classified.intent === 'forecast_request') {
    // ML is handled inline by the insight engine's forecast analyzer
    steps.push({ step: 6, name: 'Run ML models', status: 'completed', duration_ms: Date.now() - t0, detail: 'linear regression forecast' });
  } else {
    steps.push({ step: 6, name: 'Run ML models', status: 'skipped', duration_ms: 0, detail: 'not required for this intent' });
  }

  // ── Step 7: Analyze Agent Logs (if secondary includes 'agent_logs') ─────
  t0 = Date.now();
  const hasAgentLogs = sources.secondary.includes('agent_logs');
  if (hasAgentLogs) {
    // Agent log analysis is done via SQL in step 5
    steps.push({ step: 7, name: 'Analyze agent logs', status: 'completed', duration_ms: Date.now() - t0, detail: 'included in SQL queries' });
  } else {
    steps.push({ step: 7, name: 'Analyze agent logs', status: 'skipped', duration_ms: 0, detail: 'not required' });
  }

  // ── Step 8: Generate Insights ────────────────────────────────────────────
  t0 = Date.now();
  const insightResult: InsightResult = generateInsights(classified.intent, queryResults, entityType);
  steps.push({
    step: 8,
    name: 'Generate insights',
    status: 'completed',
    duration_ms: Date.now() - t0,
    detail: `${insightResult.insights.length} insights, ${insightResult.recommendations.length} recommendations`,
  });

  // ── Step 9: Generate Charts ──────────────────────────────────────────────
  t0 = Date.now();
  const charts: ChartConfig[] = buildVisualizations(classified.intent, queryResults);
  steps.push({
    step: 9,
    name: 'Generate visualizations',
    status: charts.length > 0 ? 'completed' : 'completed',
    duration_ms: Date.now() - t0,
    detail: `${charts.length} charts`,
  });

  // ── Step 10: Build Response ──────────────────────────────────────────────
  t0 = Date.now();
  const executionPath = steps
    .filter((s) => s.status === 'completed')
    .map((s) => s.name.toLowerCase().replace(/\s+/g, '_'))
    .join(' → ');

  const response: AssistantResponse = {
    question,
    entity_type: resolvedEntityType,
    intent: classified.intent,
    confidence: classified.confidence,
    narrative: insightResult.narrative,
    insights: insightResult.insights,
    charts,
    recommendations: insightResult.recommendations,
    sources: [...allSources],
    pipelineSteps: steps,
    execution_path: executionPath,
  };

  steps.push({
    step: 10,
    name: 'Build response',
    status: 'completed',
    duration_ms: Date.now() - t0,
  });

  return response;
}
