import { useState, useCallback } from 'react';
import { assistantQuery, queryOrchestrator, QueryResponse, AssistantResponse, PipelineStep } from '../services/intelligenceApi';

export interface EnrichedQueryResponse extends QueryResponse {
  /** Pipeline steps from the deterministic assistant engine */
  pipelineSteps?: PipelineStep[];
  /** Structured insights from insight engine */
  insights?: AssistantResponse['insights'];
  /** Recommendations from the assistant */
  recommendations?: string[];
  /** Confidence score from intent classification */
  confidence?: number;
}

interface UseIntelligenceQueryReturn {
  response: EnrichedQueryResponse | null;
  loading: boolean;
  error: string | null;
  query: (question: string, scope?: Record<string, any>) => Promise<void>;
  reset: () => void;
}

/**
 * Maps the deterministic AssistantResponse to the existing QueryResponse shape
 * so the UI can display it without breaking existing rendering.
 */
function mapAssistantToQueryResponse(r: AssistantResponse): EnrichedQueryResponse {
  return {
    question: r.question,
    intent: r.intent,
    narrative: r.narrative,
    data: {
      entity_type: r.entity_type,
      confidence: r.confidence,
      insights: r.insights,
      recommendations: r.recommendations,
    },
    visualizations: r.charts.map((c) => ({
      chart_type: c.type,
      title: c.title,
      data: c.data,
      config: { label_key: c.labelKey, value_key: c.valueKey },
    })),
    follow_ups: r.recommendations.slice(0, 4),
    sources: r.sources,
    execution_path: r.execution_path,
    // Enriched fields
    pipelineSteps: r.pipelineSteps,
    insights: r.insights,
    recommendations: r.recommendations,
    confidence: r.confidence,
  };
}

export function useIntelligenceQuery(): UseIntelligenceQueryReturn {
  const [response, setResponse] = useState<EnrichedQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(async (question: string, scope?: Record<string, any>) => {
    setLoading(true);
    setError(null);
    try {
      // Try deterministic assistant pipeline first
      const entityType = scope?.entity_type as string | undefined;
      const result = await assistantQuery(question, entityType);
      setResponse(mapAssistantToQueryResponse(result.data));
    } catch (assistantErr: any) {
      // Fallback to legacy orchestrator if assistant endpoint fails
      console.warn('[useIntelligenceQuery] Assistant endpoint failed, falling back to orchestrator:', assistantErr?.message);
      try {
        const result = await queryOrchestrator(question, scope);
        setResponse(result.data);
      } catch (err: any) {
        const message = err?.response?.data?.error || err?.message || 'Query failed';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResponse(null);
    setError(null);
  }, []);

  return { response, loading, error, query, reset };
}
