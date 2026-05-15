/**
 * coryPriorityMatcher — pure helpers to map Cory's current next_action
 * to the operational domain that owns it.
 *
 * Operational Priority Topology Sprint, 2026-05-15.
 *
 * Strategy (in priority order):
 *   1. If nextAction.metadata.bp_id matches a BP in any bucket, return
 *      that bucket's domain key.
 *   2. Otherwise, keyword-match the action title against each BP's name
 *      (case-insensitive). Longest match wins to avoid spurious hits.
 *   3. Return null when nothing matches confidently.
 *
 * The "why this matters" sentence is a calm composition of the priority
 * domain's downstream relationships — never prescriptive.
 *
 * Hard rules — asserted by tests:
 *   - Returns null when no signal (no next action, no priority match)
 *   - Never throws on malformed input
 *   - whyThisMattersSentence is observational, conditional, never
 *     imperative
 */
import type { DomainBucket, DomainKey } from './bpDomainClassifier';

/** Minimal shape we care about — keeps this util independent of the full state type. */
export interface NextActionLike {
  title?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

const MIN_KEYWORD_LENGTH = 6;

export function matchCoryPriorityDomain(
  nextAction: NextActionLike | null | undefined,
  buckets: DomainBucket[],
): DomainKey | null {
  if (!nextAction || buckets.length === 0) return null;

  // 1. Explicit bp_id from metadata (best signal when available).
  const bpId = nextAction.metadata?.bp_id;
  if (typeof bpId === 'string' && bpId.length > 0) {
    for (const b of buckets) {
      if (b.processes.some(p => p.id === bpId)) return b.key;
    }
  }

  // 2. Keyword match on the action title against BP names.
  const haystack = (nextAction.title || '').toLowerCase();
  if (!haystack) return null;
  let best: { key: DomainKey; len: number } | null = null;
  for (const b of buckets) {
    for (const p of b.processes) {
      const name = (p.name || '').toLowerCase();
      if (name.length < MIN_KEYWORD_LENGTH) continue;
      if (haystack.includes(name)) {
        if (!best || name.length > best.len) best = { key: b.key, len: name.length };
      }
    }
  }
  return best?.key ?? null;
}

/**
 * "Cory's current priority sits in Lead Intelligence — strengthening it
 *  would influence Marketing Operations, Execution Systems, and
 *  Reporting & Analytics."
 *
 * Returns null when there is no priority domain or when the domain has
 * no downstream — silence is honest no-signal behavior.
 */
export function whyThisMattersSentence(
  priorityDomain: DomainBucket | null | undefined,
): string | null {
  if (!priorityDomain) return null;
  const downstream = priorityDomain.relationships
    .filter(r => r.verb === 'feeds' || r.verb === 'supports')
    .map(r => r.targetLabel);
  if (downstream.length === 0) {
    return `Cory's current priority sits in ${priorityDomain.label}.`;
  }
  return `Cory's current priority sits in ${priorityDomain.label} — strengthening it would influence ${joinLabels(downstream)}.`;
}

function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
