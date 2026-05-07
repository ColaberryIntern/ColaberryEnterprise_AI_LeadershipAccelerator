import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface MultimodalVisionAnalysis {
  source: 'llm' | 'rule_based' | 'cached';
  overall_assessment: string;
  cognition_score: number;
  visual_hierarchy_score: number;
  cta_prominence_score: number;
  aesthetic_harmony_score: number;
  workflow_intuitiveness_score: number;
  accessibility_score: number;
  observations: string[];
  concerns: string[];
  suggested_improvements: { title: string; body: string; expected_ux_impact: number; kind: string }[];
  highlight_regions: { kind: string; x_pct: number; y_pct: number; width_pct: number; height_pct: number; label: string }[];
  confidence: number;
}

export interface AnalyzeImageResult {
  analysis: MultimodalVisionAnalysis;
  cache_hit: boolean;
  provider_id: 'gpt4o' | 'stub' | 'none';
  elapsed_ms: number;
}

export function useMultimodalVision() {
  const [data, setData] = useState<AnalyzeImageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (input: {
    route: string;
    screenshot_path: string;
    comparison_screenshot_path?: string | null;
    viewport?: { width: number; height: number; label?: 'desktop' | 'tablet' | 'mobile' };
    user_intent?: string;
    focus_regions?: { x: number; y: number; width: number; height: number; note?: string }[];
    known_critical_actions?: string[];
    known_workflows?: string[];
    comparing?: boolean;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/multimodal/analyze', input);
      setData(r.data as AnalyzeImageResult);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to analyze');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, analyze };
}
