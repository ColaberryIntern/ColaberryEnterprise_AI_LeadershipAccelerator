/**
 * operatorOrientationLanguage — pure editorial sentence builders for the
 * Operator Orientation surfaces.
 *
 * Operator Orientation Sprint, 2026-05-14.
 *
 * All language lives here, in one testable place, so the calm /
 * anti-gamification guardrails are enforced in exactly one spot:
 *   - No exclamation marks, no "great job", no streaks, no points.
 *   - No congratulation. The tone is orienting, not evaluative.
 *   - Honest framing: we say work happened AND a score moved — never that
 *     the work *caused* the move. Temporal correlation, not claimed causation.
 *
 * Every builder returns `null` when there is nothing meaningful to say, so
 * the surfaces can simply not render rather than show an empty state.
 */
import type { OperatorFocus } from '../hooks/useOperatorFocus';
import type { OperationalMomentum } from '../hooks/useOperationalMomentum';
import type { OperatorContribution } from '../hooks/useWorkspaceMemory';

export interface MomentumSignal {
  key: 'readiness' | 'coverage' | 'health' | 'queue';
  /** Subject-verb clause for impact lines: "readiness strengthened". */
  clause: string;
  /** Short noun for contribution memory: "readiness". */
  noun: string;
  /** Positive magnitude of the movement. */
  amount: number;
}

const SIGNAL_PRIORITY: MomentumSignal['key'][] = ['readiness', 'coverage', 'health', 'queue'];

/**
 * The single strongest forward signal in the momentum, or null when nothing
 * has moved forward. "Forward" is direction-aware: readiness/coverage/health
 * up is forward, queue down is forward.
 */
export function dominantSignal(m: OperationalMomentum): MomentumSignal | null {
  const candidates: MomentumSignal[] = [];
  if (m.readinessDelta != null && m.readinessDelta > 0) {
    candidates.push({ key: 'readiness', clause: 'readiness strengthened', noun: 'readiness', amount: m.readinessDelta });
  }
  if (m.coverageDelta != null && m.coverageDelta > 0) {
    candidates.push({ key: 'coverage', clause: 'coverage expanded', noun: 'coverage', amount: m.coverageDelta });
  }
  if (m.healthDelta != null && m.healthDelta > 0) {
    candidates.push({ key: 'health', clause: 'stability improved', noun: 'stability', amount: m.healthDelta });
  }
  if (m.queueDelta != null && m.queueDelta < 0) {
    candidates.push({ key: 'queue', clause: 'the queue got lighter', noun: 'queue clarity', amount: -m.queueDelta });
  }
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return SIGNAL_PRIORITY.indexOf(a.key) - SIGNAL_PRIORITY.indexOf(b.key);
  })[0];
}

/**
 * "You are currently shaping Lead Intelligence." — the orienting headline.
 * Null when there is no focus domain.
 */
export function orientationSentence(focus: OperatorFocus): string | null {
  if (!focus.domain) return null;
  if (focus.confidence === 'recent') {
    return `You are currently shaping ${focus.domain.label}.`;
  }
  return `Your recent operational focus has been ${focus.domain.label}.`;
}

/** Join labels into calm prose: ["A"] → "A"; ["A","B"] → "A and B"; ["A","B","C"] → "A, B, and C". */
function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * "Your work here flows into Marketing and Reporting." — connects the
 * operator's focus to the domains it influences downstream. Null when the
 * focus domain has no downstream relationships.
 */
export function flowsIntoSentence(focus: OperatorFocus): string | null {
  if (!focus.domain) return null;
  const labels = focus.domain.downstreamLabels;
  if (labels.length === 0) return null;
  return `Your work here flows into ${joinLabels(labels)}.`;
}

/**
 * "While you were shaping Lead Intelligence, readiness strengthened." —
 * honest impact framing. Null when there is no forward motion to report.
 */
export function impactSentence(focus: OperatorFocus, m: OperationalMomentum): string | null {
  const signal = dominantSignal(m);
  if (!signal) return null;
  if (focus.domain) {
    return `While you were shaping ${focus.domain.label}, ${signal.clause}.`;
  }
  return `Since your last visit, ${signal.clause}.`;
}

/**
 * Short ambient value for the history strip's "Last improvement" piece:
 * "readiness in Lead Intelligence". Null when there is no contribution memory.
 */
export function contributionLine(c: OperatorContribution | undefined): string | null {
  if (!c) return null;
  return `${c.signal} in ${c.domainLabel}`;
}
