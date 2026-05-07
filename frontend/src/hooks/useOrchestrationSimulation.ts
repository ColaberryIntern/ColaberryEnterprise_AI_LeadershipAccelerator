import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface SimulatedTask {
  id: string;
  type: string;
  priority_score: number;
  blocking_score: number;
  execution_cost: number;
}

export interface SimulationStep {
  position: number;
  task_id: string;
  task_type: string;
  pressure_after: number;
  cognition_after: number;
  delta_pressure: number;
  delta_cognition: number;
}

export interface SimulationOutcome {
  final_pressure: number;
  final_cognition: number;
  net_pressure_drop: number;
  net_cognition_gain: number;
  steps: SimulationStep[];
  summary: string;
}

export function useOrchestrationSimulation() {
  const [outcome, setOutcome] = useState<SimulationOutcome | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulate = useCallback(async (input: { initial_pressure: number; initial_cognition: number; tasks: SimulatedTask[] }) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/learning/simulate', input);
      setOutcome(r.data as SimulationOutcome);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Simulation failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const compare = useCallback(async (input: { initial_pressure: number; initial_cognition: number; ordering_a: SimulatedTask[]; ordering_b: SimulatedTask[] }) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.post('/api/portal/project/learning/compare-orderings', input);
      setComparison(r.data);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Comparison failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { outcome, comparison, loading, error, simulate, compare };
}
