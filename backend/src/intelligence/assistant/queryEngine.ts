// ─── Query Engine ─────────────────────────────────────────────────────────
// 9-step orchestration pipeline for the Intelligence OS AI Assistant.
// Dispatches to SQL, ML, vector search, and LLM dynamically.
// Graceful degradation: skips unavailable services, falls back to rules.

import { classifyIntent, Intent } from './intentClassifier';
import { generatePlan, ExecutionPlan } from './planBuilder';
import { executeSQLQueries, SqlResult } from './sqlExecutor';
import { executeML, MlResult } from './mlExecutor';
import { executeVectorSearch, VectorResult } from './vectorExecutor';
import { buildContext, Insight, PipelineContext } from './contextBuilder';
import { selectVisualizations, ChartConfig } from './chartSelector';
import { generateFollowups } from './followupGenerator';
import { chatCompletion } from './openaiHelper';

// ─── Response Types (matching frontend AssistantResponse) ────────────────────

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
  insights: Array<{ type: string; severity: string; message: string; metric?: string; value?: number }>;
  charts: Array<{ type: string; title: string; data: Record<string, any>[]; labelKey: string; valueKey: string }>;
  recommendations: string[];
  sources: string[];
  pipelineSteps: PipelineStep[];
  execution_path: string;
}

// ─── Pipeline Orchestrator ───────────────────────────────────────────────────

export async function runAssistantPipeline(
  question: string,
  entityType?: string
): Promise<AssistantResponse> {
  const steps: PipelineStep[] = [];
  let t0: number;

  // ── Step 1: Classify Intent ──────────────────────────────────────────────
  t0 = Date.now();
  let intent: Intent = 'general_insight';
  let confidence = 0.5;
  let classifyMethod = 'keyword';
  try {
    const classified = await classifyIntent(question, entityType);
    intent = classified.intent;
    confidence = classified.confidence;
    classifyMethod = classified.method;
    steps.push({
      step: 1,
      name: 'Classify intent',
      status: 'completed',
      duration_ms: Date.now() - t0,
      detail: `${intent} (${classifyMethod}, confidence: ${confidence.toFixed(2)})`,
    });
  } catch (err: any) {
    steps.push({ step: 1, name: 'Classify intent', status: 'error', duration_ms: Date.now() - t0, detail: err?.message });
  }

  // ── Step 2: Generate Execution Plan ────────────────────────────────────────
  t0 = Date.now();
  let plan: ExecutionPlan = { sql: true, ml: [], vector: [], tables: [], parameters: {} };
  try {
    plan = await generatePlan(intent, question, entityType);
    steps.push({
      step: 2,
      name: 'Generate plan',
      status: 'completed',
      duration_ms: Date.now() - t0,
      detail: `sql:${plan.sql}, ml:[${plan.ml.join(',')}], vector:[${plan.vector.join(',')}], tables:${plan.tables.length}`,
    });
  } catch (err: any) {
    steps.push({ step: 2, name: 'Generate plan', status: 'error', duration_ms: Date.now() - t0, detail: err?.message });
  }

  // ── Steps 3-5: Execute SQL + ML + Vector in PARALLEL ─────────────────────
  t0 = Date.now();
  let sqlResults: SqlResult[] = [];
  let mlResults: MlResult[] = [];
  let vectorResults: VectorResult[] = [];

  const [sqlSettled, mlSettled, vectorSettled] = await Promise.allSettled([
    plan.sql ? executeSQLQueries(plan, intent, question, entityType) : Promise.resolve([]),
    plan.ml.length > 0 ? executeML(plan.ml, entityType) : Promise.resolve([]),
    plan.vector.length > 0 ? executeVectorSearch(plan.vector, question, entityType) : Promise.resolve([]),
  ]);

  const parallelDuration = Date.now() - t0;

  // Step 3: SQL
  if (sqlSettled.status === 'fulfilled') {
    sqlResults = sqlSettled.value;
    const totalRows = sqlResults.reduce((s, r) => s + r.rows.length, 0);
    const methods = [...new Set(sqlResults.map((r) => r.method))];
    steps.push({
      step: 3,
      name: 'Execute SQL',
      status: plan.sql ? 'completed' : 'skipped',
      duration_ms: parallelDuration,
      detail: plan.sql ? `${sqlResults.length} queries → ${totalRows} rows (${methods.join(', ')})` : 'not in plan',
    });
  } else {
    steps.push({ step: 3, name: 'Execute SQL', status: 'error', duration_ms: parallelDuration, detail: (sqlSettled as any).reason?.message });
  }

  // Step 4: ML
  if (mlSettled.status === 'fulfilled') {
    mlResults = mlSettled.value;
    const successCount = mlResults.filter((r) => r.status === 'success').length;
    steps.push({
      step: 4,
      name: 'Execute ML',
      status: plan.ml.length > 0 ? (successCount > 0 ? 'completed' : 'error') : 'skipped',
      duration_ms: parallelDuration,
      detail: plan.ml.length > 0 ? `${successCount}/${plan.ml.length} models ran` : 'not in plan',
    });
  } else {
    steps.push({ step: 4, name: 'Execute ML', status: plan.ml.length > 0 ? 'error' : 'skipped', duration_ms: parallelDuration, detail: plan.ml.length > 0 ? (mlSettled as any).reason?.message : 'not in plan' });
  }

  // Step 5: Vector
  if (vectorSettled.status === 'fulfilled') {
    vectorResults = vectorSettled.value;
    const successCount = vectorResults.filter((r) => r.status === 'success').length;
    steps.push({
      step: 5,
      name: 'Execute vector search',
      status: plan.vector.length > 0 ? (successCount > 0 ? 'completed' : 'error') : 'skipped',
      duration_ms: parallelDuration,
      detail: plan.vector.length > 0 ? `${successCount}/${plan.vector.length} searches` : 'not in plan',
    });
  } else {
    steps.push({ step: 5, name: 'Execute vector search', status: plan.vector.length > 0 ? 'error' : 'skipped', duration_ms: parallelDuration, detail: plan.vector.length > 0 ? (vectorSettled as any).reason?.message : 'not in plan' });
  }

  // ── Step 6: Build Context ──────────────────────────────────────────────────
  t0 = Date.now();
  let context: PipelineContext = {
    formattedContext: '',
    insights: [],
    recommendations: [],
    ruleNarrative: 'No data available.',
    tokenEstimate: 0,
    sources: [],
  };
  try {
    context = buildContext(intent, sqlResults, mlResults, vectorResults, question, entityType);
    steps.push({
      step: 6,
      name: 'Build context',
      status: 'completed',
      duration_ms: Date.now() - t0,
      detail: `${context.insights.length} insights, ${context.tokenEstimate} tokens`,
    });
  } catch (err: any) {
    steps.push({ step: 6, name: 'Build context', status: 'error', duration_ms: Date.now() - t0, detail: err?.message });
  }

  // ── Step 7: Generate Narrative ─────────────────────────────────────────────
  t0 = Date.now();
  let narrative = context.ruleNarrative;
  let recommendations = context.recommendations;
  try {
    const llmNarrative = await generateNarrative(context, intent, question, entityType);
    if (llmNarrative) {
      narrative = llmNarrative.narrative;
      if (llmNarrative.recommendations.length > 0) {
        recommendations = llmNarrative.recommendations;
      }
      steps.push({ step: 7, name: 'Generate narrative', status: 'completed', duration_ms: Date.now() - t0, detail: 'LLM-generated' });
    } else {
      steps.push({ step: 7, name: 'Generate narrative', status: 'completed', duration_ms: Date.now() - t0, detail: 'rule-based fallback' });
    }
  } catch (err: any) {
    steps.push({ step: 7, name: 'Generate narrative', status: 'error', duration_ms: Date.now() - t0, detail: err?.message });
  }

  // ── Step 8: Select Visualizations ──────────────────────────────────────────
  t0 = Date.now();
  let charts: ChartConfig[] = [];
  try {
    charts = selectVisualizations(intent, sqlResults, mlResults, vectorResults);
    steps.push({
      step: 8,
      name: 'Select visualizations',
      status: 'completed',
      duration_ms: Date.now() - t0,
      detail: `${charts.length} charts`,
    });
  } catch (err: any) {
    steps.push({ step: 8, name: 'Select visualizations', status: 'error', duration_ms: Date.now() - t0, detail: err?.message });
  }

  // ── Step 9: Generate Follow-ups ────────────────────────────────────────────
  t0 = Date.now();
  let followUps: string[] = [];
  try {
    followUps = await generateFollowups(intent, question, entityType, context.ruleNarrative);
    steps.push({
      step: 9,
      name: 'Generate follow-ups',
      status: 'completed',
      duration_ms: Date.now() - t0,
      detail: `${followUps.length} questions`,
    });
  } catch (err: any) {
    steps.push({ step: 9, name: 'Generate follow-ups', status: 'error', duration_ms: Date.now() - t0, detail: err?.message });
  }

  // ── Build Final Response ───────────────────────────────────────────────────
  const executionPath = steps
    .filter((s) => s.status === 'completed')
    .map((s) => s.name.toLowerCase().replace(/\s+/g, '_'))
    .join(' → ');

  return {
    question,
    entity_type: entityType || null,
    intent,
    confidence,
    narrative,
    insights: context.insights.map((i: Insight) => ({
      type: i.type,
      severity: i.severity,
      message: i.message,
      metric: i.metric,
      value: i.value,
    })),
    charts,
    recommendations: recommendations.length > 0 ? recommendations : followUps,
    sources: context.sources,
    pipelineSteps: steps,
    execution_path: executionPath,
  };
}

// ─── LLM Narrative Generation ────────────────────────────────────────────────

async function generateNarrative(
  context: PipelineContext,
  intent: Intent,
  question: string,
  entityType?: string
): Promise<{ narrative: string; recommendations: string[] } | null> {
  if (context.formattedContext.length < 20) return null;

  const system = `You are a senior data analyst for Colaberry, an enterprise education technology company.
Generate a concise executive summary (120-200 words) from the data provided.
Rules:
- Be specific with numbers — reference actual metrics from the data
- Explain causes and trends when visible
- Include 2-4 actionable recommendations
- Never fabricate data points
- Respond as JSON: { "narrative": "...", "recommendations": ["...", "..."] }`;

  const user = `Question: ${question}
Intent: ${intent}
${entityType ? `Entity scope: ${entityType}` : 'Scope: global'}

Data context:
${context.formattedContext.slice(0, 6000)}`;

  const raw = await chatCompletion(system, user, { json: true, maxTokens: 600, temperature: 0.3 });
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.narrative === 'string' && Array.isArray(parsed.recommendations)) {
      return { narrative: parsed.narrative, recommendations: parsed.recommendations };
    }
    return null;
  } catch {
    return null;
  }
}
