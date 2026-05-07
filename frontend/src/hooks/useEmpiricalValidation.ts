import { useEffect, useState } from 'react';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface EmpiricalValidationEvent {
  mutation_id: string;
  mutation_success: boolean;
  rendered_change_verified: boolean | null;
  cognition_improvement_verified: boolean | null;
  regression_detected: boolean;
  rollback_required: boolean;
  verification_confidence: number;
  evidence: any;
  verified_at: string;
}

/**
 * Phase 15: stream-only hook listening to `mutation.empirical.validation`
 * events. Each event surfaces the verification result for a fired
 * mutation. Consumers can subscribe to the latest validation outcome
 * without polling.
 */
export function useEmpiricalValidation() {
  const [latest, setLatest] = useState<EmpiricalValidationEvent | null>(null);
  const [history, setHistory] = useState<EmpiricalValidationEvent[]>([]);
  const stream = useRealtimeAwareness({ kinds: ['mutation.empirical.validation'] });

  useEffect(() => {
    const ev = stream.latest as any;
    if (!ev || ev.kind !== 'mutation.empirical.validation' || !ev.payload) return;
    const validation = ev.payload as EmpiricalValidationEvent;
    setLatest(validation);
    setHistory(h => [validation, ...h].slice(0, 25));
  }, [stream.latest]);

  return { latest, history, streamConnected: stream.connected };
}
