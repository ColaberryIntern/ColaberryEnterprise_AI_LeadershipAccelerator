/**
 * operateSignals — production signals, and what they are allowed to do. PURE, no I/O.
 *
 * Master plan §Gate 14's Operate phase captures ten signals and then draws the line that
 * matters most in this whole module:
 *
 *   > Production signal may propose a defect, optimization, new requirement, agent tuning
 *   > or architecture change. **It creates a candidate, not an automatic production
 *   > mutation.**
 *
 * ## Why a signal proposes and never acts
 *
 * A system that changes production in response to its own telemetry has no one to ask when
 * the telemetry is wrong. Latency spikes because a client ran a bulk import; the optimizer
 * "fixes" it by widening a cache; the next bulk import is served stale data. Every step was
 * locally reasonable and nobody decided anything. A candidate keeps a person in the loop at
 * the only point where the loop matters — before the change, not in the postmortem.
 *
 * ## No signal has ever arrived
 *
 * Nothing built in this workstream is deployed (§20), so every structure here has been
 * exercised only by tests. `SignalReading` therefore distinguishes **`not_observed`** from
 * a value: an operate dashboard that renders green because no data arrived is the specific
 * failure worth engineering against, and it is the failure most likely to occur here, since
 * no data has ever arrived.
 */

/** The ten safe production signals from master plan §Gate 14. */
export type OperateSignal =
  | 'availability'
  | 'errors'
  | 'latency'
  | 'agent_success'
  | 'ai_evals'
  | 'cost'
  | 'usage'
  | 'security_findings'
  | 'data_quality'
  | 'business_kpis';

export const OPERATE_SIGNALS: readonly OperateSignal[] = [
  'availability',
  'errors',
  'latency',
  'agent_success',
  'ai_evals',
  'cost',
  'usage',
  'security_findings',
  'data_quality',
  'business_kpis',
];

export function isOperateSignal(value: string): value is OperateSignal {
  return (OPERATE_SIGNALS as readonly string[]).includes(value);
}

/**
 * A reading, or the explicit absence of one.
 *
 * `not_observed` is a first-class state rather than a null value, so that code handling
 * readings has to acknowledge it. A nullable number invites `value ?? 0`, and a zero error
 * rate that means "no data" is indistinguishable from a zero error rate that means
 * "nothing broke".
 */
export type SignalReading =
  | { status: 'observed'; signal: OperateSignal; value: number; observedAt: Date }
  | { status: 'not_observed'; signal: OperateSignal; reason: string };

export function notObserved(signal: OperateSignal, reason: string): SignalReading {
  return { status: 'not_observed', signal, reason };
}

/** True only when a real measurement exists. Never infers a value. */
export function hasReading(reading: SignalReading): reading is Extract<SignalReading, { status: 'observed' }> {
  return reading.status === 'observed';
}

/**
 * Health as far as the data supports — and no further.
 *
 * Returns `unknown` when a signal was not observed, rather than `healthy`. This is the
 * whole reason the type above exists.
 */
export type SignalHealth = 'healthy' | 'degraded' | 'unknown';

export interface SignalThreshold {
  signal: OperateSignal;
  /** Reading at or beyond which the signal is degraded. */
  degradedAt: number;
  /** True when higher is worse (errors, latency, cost); false when lower is worse. */
  higherIsWorse: boolean;
}

export function assessSignal(
  reading: SignalReading,
  threshold: SignalThreshold,
): SignalHealth {
  if (!hasReading(reading)) return 'unknown';
  return threshold.higherIsWorse
    ? reading.value >= threshold.degradedAt
      ? 'degraded'
      : 'healthy'
    : reading.value <= threshold.degradedAt
      ? 'degraded'
      : 'healthy';
}

/** What a signal may propose. Master plan §Gate 14. */
export type CandidateKind =
  | 'defect'
  | 'optimization'
  | 'new_requirement'
  | 'agent_tuning'
  | 'architecture_change';

export const CANDIDATE_KINDS: readonly CandidateKind[] = [
  'defect',
  'optimization',
  'new_requirement',
  'agent_tuning',
  'architecture_change',
];

/**
 * A proposal. Never an action.
 *
 * `status` starts at `proposed` and there is no transition in this module that applies it —
 * applying a candidate means creating a story or a decision through the ordinary gates,
 * where a human approves it. That is not an oversight; it is the control.
 */
export interface SignalCandidate {
  kind: CandidateKind;
  signal: OperateSignal;
  summary: string;
  /** The reading that prompted it. Absent when the *absence* of data is the finding. */
  evidence: SignalReading;
  status: 'proposed';
  /** True when this needs a person before anything else happens. Always true. */
  requiresHumanReview: true;
}

export interface CandidateRefusal {
  rule: string;
  detail: string;
}

export type CandidateDecision =
  | { created: true; candidate: SignalCandidate }
  | { created: false; refusals: CandidateRefusal[] };

const MIN_SUMMARY_LENGTH = 15;

/**
 * Turn a signal into a candidate.
 *
 * Refuses to raise a candidate from an unobserved signal *unless* the candidate is
 * explicitly about the missing telemetry itself. "Latency is bad" inferred from no latency
 * data is a fabrication; "we are not measuring latency" is a real and often more important
 * finding, and this distinction is why `not_observed` carries a reason.
 */
export function proposeCandidate(input: {
  kind: string;
  signal: string;
  summary: string;
  evidence: SignalReading;
  /** True when the candidate is about the absence of measurement, not about a value. */
  aboutMissingTelemetry?: boolean;
}): CandidateDecision {
  const refusals: CandidateRefusal[] = [];

  if (!(CANDIDATE_KINDS as readonly string[]).includes(input.kind)) {
    refusals.push({ rule: 'unknown_kind', detail: `'${input.kind}' is not a candidate kind.` });
  }
  if (!isOperateSignal(input.signal)) {
    refusals.push({ rule: 'unknown_signal', detail: `'${input.signal}' is not an operate signal.` });
  }
  if (!input.summary || input.summary.trim().length < MIN_SUMMARY_LENGTH) {
    refusals.push({
      rule: 'summary_insufficient',
      detail: 'A candidate needs a summary a person could act on.',
    });
  }

  if (!hasReading(input.evidence) && !input.aboutMissingTelemetry) {
    refusals.push({
      rule: 'no_observation',
      detail:
        `Signal '${input.signal}' was not observed (${input.evidence.status === 'not_observed' ? input.evidence.reason : 'unknown'}). ` +
        'A conclusion drawn from absent telemetry is a fabrication. Raise a candidate about ' +
        'the missing measurement instead.',
    });
  }

  if (refusals.length > 0) return { created: false, refusals };

  return {
    created: true,
    candidate: {
      kind: input.kind as CandidateKind,
      signal: input.signal as OperateSignal,
      summary: input.summary.trim(),
      evidence: input.evidence,
      status: 'proposed',
      requiresHumanReview: true,
    },
  };
}
