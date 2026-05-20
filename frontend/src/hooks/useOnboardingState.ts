/**
 * useOnboardingState — 2026-05-20.
 *
 * Reads /api/portal/onboarding/state once on mount and surfaces the
 * stage + gates. Used by:
 *   - CoryHome to decide between dashboard view and requirements builder
 *   - PortalLayout header to disable top-nav tabs the user hasn't unlocked
 *
 * Loading state: returns null while in flight. Consumers should render
 * a spinner or treat as "not yet known."
 */
import { useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export type OnboardingStage = 'needs_requirements' | 'has_requirements' | 'has_code' | 'ready';

export interface OnboardingGates {
  home: boolean;
  critique: boolean;
  blueprint: boolean;
  system: boolean;
  sessions: boolean;
}

export interface OnboardingState {
  stage: OnboardingStage;
  project_id: string | null;
  has_project: boolean;
  has_requirements_doc: boolean;
  requirements_count: number;
  capability_count: number;
  capabilities_with_routes: number;
  gates: OnboardingGates;
}

export interface UseOnboardingState {
  state: OnboardingState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useOnboardingState(): UseOnboardingState {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/onboarding/state');
      setState(r.data as OnboardingState);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load onboarding state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return { state, loading, error, refresh };
}
