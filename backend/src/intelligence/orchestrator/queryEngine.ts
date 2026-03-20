import { intelligenceProxy } from '../../services/intelligenceProxyService';
import { generateLocalSummary } from '../services/executiveSummaryService';
import { handleLocalQuery } from '../services/localQueryEngine';
import { buildEntityNetwork, EntityNetwork } from '../services/entityGraphService';
import { runAssistantPipeline } from '../assistant/queryEngine';
import { getDepartmentFocus } from '../assistant/planBuilder';

interface QueryResponse {
  question: string;
  intent: string;
  narrative: string;
  data: Record<string, any>;
  visualizations: Array<{
    chart_type: string;
    title: string;
    data: Record<string, any>[];
    config: Record<string, any>;
  }>;
  follow_ups: string[];
  sources: string[];
  execution_path: string;
}

// Cached Python health check with in-flight deduplication
let pythonHealthy: boolean | null = null;
let healthCheckTime = 0;
let _healthCheckPromise: Promise<boolean> | null = null;
const HEALTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function isPythonAvailable(): Promise<boolean> {
  // Return cached result if still fresh
  if (pythonHealthy !== null && Date.now() - healthCheckTime < HEALTH_TTL_MS) {
    return pythonHealthy;
  }

  // Deduplicate: if a health check is already in-flight, reuse its promise
  if (!_healthCheckPromise) {
    _healthCheckPromise = (async () => {
      try {
        await intelligenceProxy.getHealth();
        pythonHealthy = true;
      } catch {
        pythonHealthy = false;
      }
      healthCheckTime = Date.now();
      _healthCheckPromise = null;
      return pythonHealthy!;
    })();
  }

  return _healthCheckPromise;
}

/**
 * Handle natural language query with Python proxy + local fallback.
 */
export async function handleQuery(
  question: string,
  scope?: Record<string, any>
): Promise<QueryResponse> {
  const pyAvailable = await isPythonAvailable();

  if (pyAvailable) {
    try {
      const result = await Promise.race([
        intelligenceProxy.queryOrchestrator({ question, scope }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Python query timeout')), 8000)
        ),
      ]);
      return (result as any).data;
    } catch {
      // Fall through to local fallback
    }
  }

  // Local fallback: smart query engine parses question and runs targeted SQL
  return handleLocalQuery(question);
}

// ─── Department-Specific Question Templates ──────────────────────────────────
// Each department gets a focused question that guides the LLM to query relevant data.

const DEPARTMENT_QUESTION_MAP: Record<string, { summary: string; insights: string }> = {
  executive: {
    summary: 'Give me a CEO-level executive overview: total leads, active campaigns, enrollment pipeline, email outreach volume, and overall system health scores',
    insights: 'What are the top strategic insights across the entire business — lead pipeline, campaign performance, enrollment trends, and system health?',
  },
  strategy: {
    summary: 'Give me a strategy overview: lead pipeline stages, strategy call completion rates, opportunity scores, conversion funnel, and enrollment trends',
    insights: 'What are the top strategic insights for pipeline conversion, strategy call effectiveness, and opportunity scoring?',
  },
  marketing: {
    summary: 'Give me a marketing department overview: campaign performance by status, email outreach volume and delivery rates, lead generation by source, communication touchpoints, and campaign error rates',
    insights: 'What are the top marketing insights — campaign ROI, email performance, lead acquisition channels, and outreach effectiveness?',
  },
  admissions: {
    summary: 'Give me an admissions overview: new leads by pipeline stage, strategy call completion rates, enrollment conversion funnel, lead temperature distribution, and communication touchpoints',
    insights: 'What are the top admissions insights — lead conversion rates, strategy call effectiveness, and enrollment pipeline health?',
  },
  alumni: {
    summary: 'Give me an alumni department overview: completed enrollments, cohort graduation rates, and alumni engagement touchpoints',
    insights: 'What are the top alumni insights — graduation rates, alumni engagement, and cohort outcomes?',
  },
  partnerships: {
    summary: 'Give me a partnerships overview: ICP profile coverage, partner-sourced leads, campaign partnerships, and partnership communication touchpoints',
    insights: 'What are the top partnership insights — ICP alignment, partner lead quality, and outreach effectiveness?',
  },
  education: {
    summary: 'Give me an education department overview: enrollment status distribution, cohort progress, attendance trends, skill mastery levels, and lesson completion rates',
    insights: 'What are the top education insights — student progress, attendance patterns, skill mastery rates, and cohort health?',
  },
  student_success: {
    summary: 'Give me a student success overview: enrollment completion rates, attendance trends, skill mastery distribution, and at-risk student indicators',
    insights: 'What are the top student success insights — completion rates, attendance patterns, and students needing intervention?',
  },
  platform: {
    summary: 'Give me a platform health overview: system process activity, agent execution status, orchestration health scores, and error rates',
    insights: 'What are the top platform insights — system stability, process throughput, and infrastructure health?',
  },
  intelligence: {
    summary: 'Give me an AI intelligence department overview: agent fleet status (active/idle/errored), agent execution counts and success rates, orchestration health scores, and system event patterns',
    insights: 'What are the top intelligence insights — agent fleet health, execution success rates, and AI system performance?',
  },
  governance: {
    summary: 'Give me a governance overview: system error rates, agent compliance status, campaign error severity breakdown, and security process activity',
    insights: 'What are the top governance insights — compliance gaps, error patterns, and security concerns?',
  },
  reporting: {
    summary: 'Give me a reporting overview: system process activity by module, agent execution logs, and entity counts across leads, campaigns, and enrollments',
    insights: 'What are the top reporting insights — data completeness, process activity trends, and entity growth?',
  },
  finance: {
    summary: 'Give me a finance overview: enrollment revenue pipeline, campaign ROI metrics, lead conversion to paid enrollment, and strategy call to enrollment conversion',
    insights: 'What are the top finance insights — revenue pipeline, campaign cost effectiveness, and enrollment economics?',
  },
  operations: {
    summary: 'Give me an operations overview: system process throughput, email delivery pipeline status, communication channel performance, agent operational health, and orchestration metrics',
    insights: 'What are the top operations insights — process efficiency, email delivery rates, and operational bottlenecks?',
  },
  orchestration: {
    summary: 'Give me an orchestration overview: agent execution counts and durations, orchestration health scores, system process status, and agent error analysis',
    insights: 'What are the top orchestration insights — execution patterns, health trends, and agent coordination efficiency?',
  },
  growth: {
    summary: 'Give me a growth department overview: weekly lead acquisition trends, campaign creation velocity, enrollment growth, email outreach scaling, and conversion funnel metrics',
    insights: 'What are the top growth insights — lead acquisition velocity, campaign scaling, and enrollment growth trajectory?',
  },
  infrastructure: {
    summary: 'Give me an infrastructure overview: system process health, orchestration uptime, agent infrastructure status, and execution performance metrics',
    insights: 'What are the top infrastructure insights — system uptime, process reliability, and infrastructure capacity?',
  },
  security: {
    summary: 'Give me a security department overview: agent error rates and anomalies, system process failures, campaign error severity breakdown, orchestration health alerts, and security-related agent activity',
    insights: 'What are the top security insights — error anomalies, failed processes, security agent status, and threat indicators?',
  },
};

function buildDepartmentQuestion(deptName: string, type: 'summary' | 'insights'): string {
  const slug = deptName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
  const mapping = DEPARTMENT_QUESTION_MAP[slug];
  if (mapping) {
    return type === 'summary' ? mapping.summary : mapping.insights;
  }
  // Fallback for unknown departments
  return type === 'summary'
    ? `Give me an executive overview of the ${deptName} department — key metrics, performance indicators, and health status`
    : `What are the top insights for the ${deptName} department — performance trends, risks, and opportunities?`;
}

/**
 * Handle executive summary with fallback.
 * Accepts optional entity_type and entity_name to scope the summary.
 */
export async function handleExecutiveSummary(entityType?: string, entityName?: string): Promise<QueryResponse> {
  try {
    const scopeLabel = entityName || entityType;
    let question: string;

    if (entityType === 'department' && entityName) {
      // Department-scoped: use a focused question that targets department-relevant data
      question = buildDepartmentQuestion(entityName, 'summary');
    } else if (scopeLabel) {
      question = `Give me an executive overview of the ${scopeLabel} — leads, campaigns, enrollments, emails, and performance metrics`;
    } else {
      question = 'Give me a full executive overview of the business — leads, campaigns, enrollments, and system health';
    }

    const result = await runAssistantPipeline(question, entityType, entityName);
    return {
      question: scopeLabel ? `Executive Summary: ${scopeLabel}` : 'Executive Summary',
      intent: 'executive_summary',
      narrative: result.narrative,
      data: {
        insights: result.insights,
        narrative_sections: result.narrative_sections,
      },
      visualizations: result.visualizations,
      follow_ups: result.recommendations,
      sources: result.sources,
      execution_path: result.execution_path,
    };
  } catch {
    return generateLocalSummary(entityType);
  }
}

/**
 * Handle ranked insights with fallback.
 * Accepts optional entity_type and entity_name to scope the insights.
 */
export async function handleRankedInsights(entityType?: string, entityName?: string): Promise<QueryResponse> {
  try {
    const scopeLabel = entityName || entityType;
    let question: string;

    if (entityType === 'department' && entityName) {
      question = buildDepartmentQuestion(entityName, 'insights');
    } else if (scopeLabel) {
      question = `What are the top insights for the ${scopeLabel} — leads, campaigns, enrollments, and performance?`;
    } else {
      question = 'What are the top insights across leads, enrollments, and campaigns?';
    }

    const result = await runAssistantPipeline(question, entityType, entityName);
    return {
      question: scopeLabel ? `Ranked Insights: ${scopeLabel}` : 'Ranked Insights',
      intent: 'general_insight',
      narrative: result.narrative,
      data: { insights: result.insights },
      visualizations: result.visualizations,
      follow_ups: result.recommendations,
      sources: result.sources,
      execution_path: result.execution_path,
    };
  } catch {
    const question = entityType
      ? `What are the top insights for ${entityType}?`
      : 'What are the top insights across leads, enrollments, and campaigns?';
    return handleLocalQuery(question);
  }
}

/**
 * Handle entity network with fallback.
 */
export async function handleEntityNetwork(): Promise<EntityNetwork> {
  const pyAvailable = await isPythonAvailable();

  if (pyAvailable) {
    try {
      const result = await Promise.race([
        intelligenceProxy.getEntityNetwork(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Python entity-network timeout')), 5000)
        ),
      ]);
      const data = (result as any).data;
      // Validate response has nodes
      if (data?.nodes?.length > 0) return data;
    } catch {
      // Fall through
    }
  }

  return buildEntityNetwork();
}
