import { intelligenceProxy } from '../../services/intelligenceProxyService';
import { generateLocalSummary } from '../services/executiveSummaryService';
import { handleLocalQuery } from '../services/localQueryEngine';
import { buildEntityNetwork, EntityNetwork } from '../services/entityGraphService';
import { runAssistantPipeline } from '../assistant/queryEngine';

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

/**
 * Handle executive summary with fallback.
 * Accepts optional entity_type to scope the summary.
 */
export async function handleExecutiveSummary(entityType?: string): Promise<QueryResponse> {
  // Use the full assistant pipeline for rich, diverse charts + KPI insights
  // This is the same pipeline Cory questions use — guarantees 2-4 charts with variety
  try {
    const question = entityType
      ? `Give me an executive overview of ${entityType}`
      : 'Give me a full executive overview of the business — leads, campaigns, enrollments, and system health';
    const result = await runAssistantPipeline(question, entityType);
    return {
      question: 'Executive Summary',
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
    // Fallback to simple local summary if pipeline fails
    return generateLocalSummary(entityType);
  }
}

/**
 * Handle ranked insights with fallback.
 */
export async function handleRankedInsights(): Promise<QueryResponse> {
  // Use assistant pipeline for data-driven insights
  try {
    const result = await runAssistantPipeline('What are the top insights across leads, enrollments, and campaigns?');
    return {
      question: 'Ranked Insights',
      intent: 'general_insight',
      narrative: result.narrative,
      data: { insights: result.insights },
      visualizations: result.visualizations,
      follow_ups: result.recommendations,
      sources: result.sources,
      execution_path: result.execution_path,
    };
  } catch {
    return handleLocalQuery('What are the top insights across leads, enrollments, and campaigns?');
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
