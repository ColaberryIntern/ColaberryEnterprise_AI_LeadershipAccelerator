import { intelligenceProxy } from '../../services/intelligenceProxyService';
import { generateLocalSummary } from '../services/executiveSummaryService';
import { handleLocalQuery } from '../services/localQueryEngine';
import { buildEntityNetwork, EntityNetwork } from '../services/entityGraphService';

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

// Cached Python health check
let pythonHealthy: boolean | null = null;
let healthCheckTime = 0;
const HEALTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function isPythonAvailable(): Promise<boolean> {
  const now = Date.now();
  if (pythonHealthy !== null && now - healthCheckTime < HEALTH_TTL_MS) {
    return pythonHealthy;
  }

  try {
    await intelligenceProxy.getHealth();
    pythonHealthy = true;
  } catch {
    pythonHealthy = false;
  }
  healthCheckTime = now;
  return pythonHealthy;
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
          setTimeout(() => reject(new Error('Python query timeout')), 30000)
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
  const pyAvailable = await isPythonAvailable();

  if (pyAvailable && !entityType) {
    try {
      const result = await Promise.race([
        intelligenceProxy.getExecutiveSummary(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Python summary timeout')), 20000)
        ),
      ]);
      return (result as any).data;
    } catch {
      // Fall through to local
    }
  }

  return generateLocalSummary(entityType);
}

/**
 * Handle ranked insights with fallback.
 */
export async function handleRankedInsights(): Promise<QueryResponse> {
  const pyAvailable = await isPythonAvailable();

  if (pyAvailable) {
    try {
      const result = await Promise.race([
        intelligenceProxy.getRankedInsights(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Python insights timeout')), 20000)
        ),
      ]);
      return (result as any).data;
    } catch {
      // Fall through
    }
  }

  // Local fallback: use smart query engine for ranked insights
  return handleLocalQuery('What are the top insights across leads, enrollments, and campaigns?');
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
          setTimeout(() => reject(new Error('Python entity-network timeout')), 10000)
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
