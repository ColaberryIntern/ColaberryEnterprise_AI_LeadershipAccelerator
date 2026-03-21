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
import { selectVisualizations, guaranteeCharts, ChartConfig } from './chartSelector';
import { generateFollowups } from './followupGenerator';
import { chatCompletion } from './openaiHelper';
import { validateAndEnrichResults, getBusinessLabel } from './agents/dataAnalystAgent';
import { validateAndFixCharts, extractNormalizedConfig } from './agents/chartValidationAgent';
import { validateReport } from './agents/reportQualityAgent';

// ─── Response Types (matching frontend AssistantResponse) ────────────────────

export interface PipelineStep {
  step: number;
  name: string;
  status: 'completed' | 'skipped' | 'error';
  duration_ms: number;
  detail?: string;
}

export interface NarrativeSections {
  executive_summary: string;
  detailed_analysis: string;
  key_findings: string[];
  risk_assessment: string;
  recommended_actions: string[];
  follow_up_areas: string[];
  tickets_created?: Array<{ ticket_number: number; title: string; priority: string; assigned_to?: string }>;
}

export interface AssistantResponse {
  question: string;
  entity_type: string | null;
  intent: Intent;
  confidence: number;
  narrative: string;
  narrative_sections: NarrativeSections | null;
  insights: Array<{ type: string; severity: string; message: string; metric?: string; value?: number }>;
  visualizations: Array<{ chart_type: string; title: string; data: Record<string, any>[]; config: Record<string, any> }>;
  recommendations: string[];
  sources: string[];
  pipelineSteps: PipelineStep[];
  execution_path: string;
}

// ─── Pipeline Orchestrator ───────────────────────────────────────────────────

export async function runAssistantPipeline(
  question: string,
  entityType?: string,
  entityName?: string
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
    plan = await generatePlan(intent, question, entityType, entityName);
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

  // ── Step 6.5: Data Analyst Agent ──────────────────────────────────────────
  // Enrich labels, filter garbage rows, coerce PostgreSQL string-typed numbers
  t0 = Date.now();
  try {
    const enriched = validateAndEnrichResults(sqlResults, context.insights);
    sqlResults = enriched.sqlResults;
    context = { ...context, insights: enriched.insights };
    steps.push({ step: 6, name: 'Data analyst validation', status: 'completed', duration_ms: Date.now() - t0, detail: 'labels enriched, types coerced' });
  } catch {
    // Fail-safe: continue with original data
  }

  // ── Step 7: Select Visualizations ──────────────────────────────────────────
  t0 = Date.now();
  let charts: ChartConfig[] = [];
  try {
    charts = selectVisualizations(intent, sqlResults, mlResults, vectorResults);
    charts = guaranteeCharts(charts, intent, sqlResults);

    // Step 7.5: Chart Validation Agent — fix types, normalize config keys
    charts = validateAndFixCharts(charts, sqlResults);

    steps.push({
      step: 7,
      name: 'Select visualizations',
      status: 'completed',
      duration_ms: Date.now() - t0,
      detail: `${charts.length} charts (validated)`,
    });
  } catch (err: any) {
    steps.push({ step: 7, name: 'Select visualizations', status: 'error', duration_ms: Date.now() - t0, detail: err?.message });
  }

  // ── Steps 8+9: Generate Follow-ups & Narrative in PARALLEL ────────────────
  // Both are LLM calls with no dependency — narrative does not need follow-ups.
  // Follow-ups are only used as fallback if narrative fails (buildRuleBasedSections).
  t0 = Date.now();
  let followUps: string[] = [];
  let narrative = context.ruleNarrative;
  let recommendations = context.recommendations;
  let narrativeSections: NarrativeSections | null = null;

  const [followUpSettled, narrativeSettled] = await Promise.allSettled([
    generateFollowups(intent, question, entityType, context.ruleNarrative),
    generateNarrative(context, intent, question, entityType),
  ]);

  const parallelNarrDuration = Date.now() - t0;

  // Extract follow-ups
  if (followUpSettled.status === 'fulfilled') {
    followUps = followUpSettled.value;
    steps.push({ step: 8, name: 'Generate follow-ups', status: 'completed', duration_ms: parallelNarrDuration, detail: `${followUps.length} questions` });
  } else {
    steps.push({ step: 8, name: 'Generate follow-ups', status: 'error', duration_ms: parallelNarrDuration, detail: (followUpSettled as PromiseRejectedResult).reason?.message });
  }

  // Extract narrative
  if (narrativeSettled.status === 'fulfilled') {
    const llmNarrative = narrativeSettled.value;
    if (llmNarrative) {
      narrative = llmNarrative.narrative;
      narrativeSections = llmNarrative.sections;
      if (llmNarrative.recommendations.length > 0) {
        recommendations = llmNarrative.recommendations;
      }
      steps.push({ step: 9, name: 'Generate narrative', status: 'completed', duration_ms: parallelNarrDuration, detail: 'LLM-generated' });
    } else {
      narrativeSections = buildRuleBasedSections(context, followUps);
      steps.push({ step: 9, name: 'Generate narrative', status: 'completed', duration_ms: parallelNarrDuration, detail: 'rule-based fallback' });
    }
  } else {
    narrativeSections = buildRuleBasedSections(context, followUps);
    steps.push({ step: 9, name: 'Generate narrative', status: 'error', duration_ms: parallelNarrDuration, detail: (narrativeSettled as PromiseRejectedResult).reason?.message });
  }

  // ── Build Final Response ───────────────────────────────────────────────────
  const executionPath = steps
    .filter((s) => s.status === 'completed')
    .map((s) => s.name.toLowerCase().replace(/\s+/g, '_'))
    .join(' → ');

  // Map insights and guarantee KPI-bearing entries
  const mappedInsights = context.insights.map((i: Insight) => ({
    type: i.type,
    severity: i.severity,
    message: i.message,
    metric: i.metric,
    value: i.value,
  }));
  extractKPIsFromResults(mappedInsights, sqlResults);

  // Transform ChartConfig[] → VisualizationSpec[] (frontend expects chart_type + config)
  // Uses extractNormalizedConfig to send the exact keys each frontend chart component needs
  const visualizations = charts.map((c) => ({
    chart_type: c.type,
    title: c.title,
    data: c.data,
    config: { ...extractNormalizedConfig(c), labelKey: c.labelKey, valueKey: c.valueKey },
  }));

  const response: AssistantResponse = {
    question,
    entity_type: entityType || null,
    intent,
    confidence,
    narrative,
    narrative_sections: narrativeSections,
    insights: mappedInsights,
    visualizations,
    recommendations: recommendations.length > 0 ? recommendations : followUps,
    sources: context.sources,
    pipelineSteps: steps,
    execution_path: executionPath,
  };

  // ── Step 9.5: Report Quality Agent ──────────────────────────────────────
  // Final quality gate: filter technical terms, ensure minimum insights
  return validateReport(response, sqlResults);
}

// ─── LLM Narrative Generation ────────────────────────────────────────────────

async function generateNarrative(
  context: PipelineContext,
  intent: Intent,
  question: string,
  entityType?: string
): Promise<{ narrative: string; sections: NarrativeSections; recommendations: string[] } | null> {
  if (context.formattedContext.length < 20) return null;

  const system = `You are the Chief Operating Officer for Colaberry, an enterprise education technology company that runs AI-powered leadership accelerator programs.
Your audience is the CEO/founder. Frame everything from the BUSINESS perspective — revenue, enrollments, lead pipeline, campaign ROI, student outcomes, and growth.
Generate a structured analysis from the data provided.

Perspective rules:
- Lead with business impact: enrollments, revenue, conversion rates, student success, campaign performance.
- AI agents and technical systems are tools that serve business goals — mention them only as supporting context (e.g. "our automated campaign system sent 47 emails" not "CampaignSchedulerAgent executed 47 times").
- Translate technical metrics into business language: "error rate" → "delivery failures affecting outreach", "agent idle" → "automation capacity available".
- When agents have errors, frame it as business risk: "3 automation processes need attention — this may delay outreach to 200 leads" not "3 agents have error_count > 0".
- Never list raw agent names, statuses, or technical IDs unless the user specifically asks about agents/system health.

Data accuracy rules:
- CRITICAL: Every number you cite MUST appear verbatim in the data context below. Do NOT estimate, round differently, or invent numbers.
- NEVER add numbers together, compute sums, or derive totals from row-level data. Only use numbers from the VERIFIED TOTALS section (e.g. "total_leads: 849", "emails_sent_7d: 805"). Row-level breakdowns are for context only — never sum them.
- If a total count is provided (e.g. "total_leads: 849"), use that exact number — do not count rows to derive a different total.
- When the data distinguishes between "total" and "active" counts, ALWAYS report both — never say "X active" when you mean "X total." Example: "13 campaigns total (11 active, 1 completed, 1 draft)" not "13 active campaigns."
- If the data does not contain a specific metric, say "data not available" instead of guessing.
- NEVER fabricate a number. If you are unsure of a number, omit it. Wrong numbers destroy executive trust.
- Explain causes and trends only when directly visible in the data.

Respond as JSON with this exact structure:
{
  "executive_summary": "2-3 sentence business-focused overview",
  "key_findings": ["business finding with numbers", "another finding"],
  "risk_assessment": "1-2 sentence business risk evaluation",
  "recommended_actions": ["business action recommendation 1", "business action 2"],
  "follow_up_areas": ["business area to investigate", "another area"]
}`;

  const user = `Question: ${question}
Intent: ${intent}
${entityType ? `Entity scope: ${entityType}` : 'Scope: global'}

Data context:
${context.formattedContext.slice(0, 6000)}`;

  const raw = await chatCompletion(system, user, { json: true, maxTokens: 800, temperature: 0.3 });
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const sections: NarrativeSections = {
      executive_summary: parsed.executive_summary || '',
      detailed_analysis: parsed.detailed_analysis || '',
      key_findings: Array.isArray(parsed.key_findings) ? parsed.key_findings : [],
      risk_assessment: parsed.risk_assessment || '',
      recommended_actions: Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions : [],
      follow_up_areas: Array.isArray(parsed.follow_up_areas) ? parsed.follow_up_areas : [],
    };
    const narrative = sections.executive_summary;
    const recommendations = sections.recommended_actions;
    return { narrative, sections, recommendations };
  } catch {
    return null;
  }
}

/**
 * Ensure insights contain KPI-bearing entries (metric + value) so the frontend
 * can render dynamic KPI cards from every Cory response.
 * Uses getBusinessLabel to ensure human-readable metric names.
 */
function extractKPIsFromResults(
  insights: Array<{ type: string; severity: string; message: string; metric?: string; value?: number }>,
  sqlResults: SqlResult[]
): void {
  const hasMetricInsights = insights.some((i) => i.metric && i.value != null);
  if (hasMetricInsights) return;

  // Phase 1: Extract from single-row aggregate SQL results (e.g. SELECT COUNT(*) AS total)
  // PostgreSQL COUNT/SUM returns bigint which Sequelize may deliver as string — handle both
  for (const sr of sqlResults) {
    if (sr.rows.length !== 1) continue;
    const row = sr.rows[0];
    for (const [key, val] of Object.entries(row)) {
      // Skip timestamps and non-numeric values
      if (key.endsWith('_at') || key.endsWith('_date') || key === 'created_at' || key === 'updated_at') continue;
      const num = Number(val);
      if (!isNaN(num) && num > 0 && isFinite(num)) {
        const bizLabel = getBusinessLabel(key);
        insights.push({
          type: 'metric',
          severity: 'info',
          message: `${bizLabel}: ${num.toLocaleString()}`,
          metric: bizLabel,
          value: num,
        });
      }
    }
    if (insights.some((i) => i.metric)) break;
  }

  // Phase 2: If still no KPIs, generate summary metrics from multi-row results
  if (!insights.some((i) => i.metric)) {
    for (const sr of sqlResults) {
      if (sr.rows.length < 2) continue;
      // Use row count as a KPI (e.g. "15 Campaigns", "849 Leads")
      const desc = sr.description.toLowerCase();
      let label = 'Records';
      if (desc.includes('campaign')) label = 'Campaigns';
      else if (desc.includes('lead')) label = 'Leads';
      else if (desc.includes('email')) label = 'Emails Sent';
      else if (desc.includes('enrollment') || desc.includes('student')) label = 'Enrollments';
      else if (desc.includes('agent')) label = 'Automation Processes';
      else if (desc.includes('communication') || desc.includes('touchpoint')) label = 'Touchpoints';

      insights.push({
        type: 'metric',
        severity: 'info',
        message: `${sr.rows.length} ${label}`,
        metric: `Total ${label}`,
        value: sr.rows.length,
      });

      // Also extract a numeric aggregate from the rows if available
      const keys = Object.keys(sr.rows[0]);
      const numKey = keys.find((k) => {
        const v = sr.rows[0][k];
        return (k === 'count' || k === 'total' || k.startsWith('total_') || k.endsWith('_count'))
          && !isNaN(Number(v)) && Number(v) > 0;
      });
      if (numKey) {
        const total = sr.rows.reduce((sum, r) => sum + (Number(r[numKey]) || 0), 0);
        if (total > 0) {
          const bizLabel = getBusinessLabel(numKey);
          insights.push({
            type: 'metric',
            severity: 'info',
            message: `${bizLabel}: ${total.toLocaleString()}`,
            metric: bizLabel,
            value: total,
          });
        }
      }
      if (insights.filter((i) => i.metric).length >= 4) break;
    }
  }
}

function buildRuleBasedSections(context: PipelineContext, followUps: string[]): NarrativeSections {
  const criticalInsights = context.insights.filter((i) => i.severity === 'critical' || i.severity === 'warning');
  return {
    executive_summary: context.ruleNarrative || 'Analysis complete based on available data.',
    detailed_analysis: '',
    key_findings: context.insights.slice(0, 5).map((i) => i.message),
    risk_assessment: criticalInsights.length > 0
      ? `${criticalInsights.length} issue${criticalInsights.length > 1 ? 's' : ''} detected requiring attention: ${criticalInsights.map((i) => i.message).join('; ')}`
      : 'No critical risks detected in the current data.',
    recommended_actions: context.recommendations.slice(0, 4),
    follow_up_areas: followUps.slice(0, 3),
  };
}
