import { useState, useCallback } from 'react';
import { queryOrchestrator, QueryResponse } from '../services/intelligenceApi';

interface UseIntelligenceQueryReturn {
  response: QueryResponse | null;
  loading: boolean;
  error: string | null;
  query: (question: string, scope?: Record<string, any>) => Promise<void>;
  reset: () => void;
}

export function useIntelligenceQuery(): UseIntelligenceQueryReturn {
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(async (question: string, scope?: Record<string, any>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryOrchestrator(question, scope);
      setResponse(result.data);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Query failed';
      setError(message);
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
