import { studentSignals } from '../runtime/runtimeService';
import { computeCertificationReadiness } from '../runtime/certificationReadiness';

/**
 * Dara v2 Phase 5 — the real, per-student signal her targeted research sweep
 * evaluates. Reuses `computeCertificationReadiness()` (pure, deterministic,
 * already real and already used per-student inside `ops/schoolSignals.ts`'s
 * roster loop) rather than inventing a new signal — the same underlying
 * computation Dara's own existing certification Director behavior already
 * flags in aggregate (`ops/directors.ts`'s `avg_pass_prob < 55`).
 *
 * Threshold kept in lockstep with that existing, already-approved Director
 * threshold (55% on the 0-100 scale == 0.55 on computeCertificationReadiness's
 * raw 0-1 `pass_probability`) rather than a new number — one real bar for
 * "certification readiness is a real concern," not two different opinions
 * about the same underlying signal.
 */
const AT_RISK_PASS_PROBABILITY = 0.55;

export interface CertificationRiskSignal {
  type: 'certification_readiness_risk';
  passProbability: number;
  weakDomains: string[];
}

/**
 * Null when the student isn't at risk, OR when they are below the threshold
 * but with no specific weak domain to name — flagging a human with "something
 * seems off, no idea what" isn't actionable and isn't sent.
 */
export async function evaluateCertificationRiskSignal(enrollmentId: string): Promise<CertificationRiskSignal | null> {
  const sig = await studentSignals(enrollmentId);
  const cert = computeCertificationReadiness(sig);
  if (cert.pass_probability >= AT_RISK_PASS_PROBABILITY) return null;
  if (cert.weak.length === 0) return null;
  return { type: 'certification_readiness_risk', passProbability: cert.pass_probability, weakDomains: cert.weak };
}
