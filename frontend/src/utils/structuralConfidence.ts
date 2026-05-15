/**
 * structuralConfidence — pure operator-facing language layer over the
 * classifier's existing lifecycleState values.
 *
 * Structural Confidence Sprint, 2026-05-15.
 *
 * The classifier already knows whether a domain is Foundational, Emerging,
 * Coordinated, Operational, Scaling, or Stabilizing. Those are technical
 * states — fine for the data model, slightly cold on the screen. This file
 * translates them into operator-facing confidence language ("Still
 * forming", "Coordinating", "Trusted") and one editorial sentence per
 * maturity tier ("X is gaining consistency", "X is operationally
 * dependable"). Same underlying facts, softer reading.
 *
 * Anti-prescription guardrails — asserted by the unit tests — match the
 * leverage layer's:
 *   - No imperatives ("you should", "fix", "must", "need to").
 *   - No certainty words ("guaranteed", "optimal", "perfect", "definitely").
 *   - No exclamation marks.
 *   - Every builder returns null when there is nothing meaningful to say.
 *
 * The system-resilience sentence intentionally reads sturdier than the
 * existing systemEvolution phrase — language about *what the system is
 * becoming* rather than what's still missing.
 */
import {
  lifecycleMaturityIndex,
  type DomainBucket,
  type LifecycleState,
} from './bpDomainClassifier';

/**
 * Operator-facing trust label. Translates the technical lifecycle state
 * into a calmer word the operator actually reads on the badge. Only four
 * of six change — Coordinated and Operational already read clearly.
 */
const TRUST_LABEL: Record<LifecycleState, string> = {
  Foundational: 'Still forming',
  Emerging:     'Coordinating',
  Coordinated:  'Coordinated',
  Operational:  'Operational',
  Scaling:      'Dependable',
  Stabilizing:  'Trusted',
};

export function trustLabel(state: LifecycleState): string {
  return TRUST_LABEL[state];
}

/**
 * One calm editorial sentence about a domain's structural confidence.
 * Phrased so it reads naturally next to the existing narrative — never
 * a verdict, always an observation. Null when the bucket carries no
 * signal worth voicing (no processes, "other" bucket, etc.).
 */
export function confidenceLine(bucket: DomainBucket): string | null {
  if (bucket.processes.length === 0) return null;
  if (bucket.key === 'other') return null; // editorial silence on the catch-all

  const hasDownstream = bucket.downstreamCount > 0;

  switch (bucket.lifecycleState) {
    case 'Foundational':
      return hasDownstream
        ? 'The structure exists, but downstream confidence remains limited.'
        : `${bucket.label} still depends heavily on manual structure.`;
    case 'Emerging':
      return `${bucket.label} is gaining consistency.`;
    case 'Coordinated':
      return `${bucket.label} is beginning to coordinate reliably.`;
    case 'Operational':
      return `${bucket.label} is operationally dependable.`;
    case 'Scaling':
      return hasDownstream
        ? `${bucket.label} now supports downstream reliability.`
        : `${bucket.label} is broadening with confidence.`;
    case 'Stabilizing':
      return `${bucket.label} feels increasingly stable.`;
    default:
      return null;
  }
}

/**
 * System-level resilience sentence. Reads what the system *is becoming*
 * rather than what's missing — a sturdier counterpart to the existing
 * systemEvolution phrase. BPDomainSurface picks one of the two to render
 * under the leverage headline.
 */
export function systemResilienceSentence(buckets: DomainBucket[]): string | null {
  if (buckets.length < 3) return null;
  const avg = buckets.reduce((s, b) => s + lifecycleMaturityIndex(b.lifecycleState), 0) / buckets.length;
  if (avg < 1.2) return 'The operational structure is still forming — most areas remain in early scaffolding.';
  if (avg < 2.2) return 'Operational coordination is starting to take hold, with maturity uneven across areas.';
  if (avg < 3.2) return 'Operational coordination is broadly in place; reliability is the next frontier.';
  if (avg < 4.0) return 'The operational structure is dependable, and downstream reliability is increasingly the focus.';
  return 'The operational structure feels stable and trusted across the system.';
}
