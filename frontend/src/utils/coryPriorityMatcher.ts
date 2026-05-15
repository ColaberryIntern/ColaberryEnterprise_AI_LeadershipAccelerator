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
import { classifyTextToDomain, type DomainBucket, type DomainKey } from './bpDomainClassifier';

/** Minimal shape we care about — keeps this util independent of the full state type. */
export interface NextActionLike {
  title?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

const MIN_BP_NAME_LENGTH = 6;

export function matchCoryPriorityDomain(
  nextAction: NextActionLike | null | undefined,
  buckets: DomainBucket[],
): DomainKey | null {
  if (!nextAction || buckets.length === 0) return null;
  const presentKeys = new Set(buckets.map(b => b.key));

  // 1. Explicit bp_id from metadata (best signal when available).
  const bpId = nextAction.metadata?.bp_id;
  if (typeof bpId === 'string' && bpId.length > 0) {
    for (const b of buckets) {
      if (b.processes.some(p => p.id === bpId)) return b.key;
    }
  }

  // 2. Keyword match on the action title against actual BP names (must
  // be at least 6 chars long to avoid spurious hits on common short
  // words). When this fires, it's the most specific match available.
  const titleHaystack = (nextAction.title || '').toLowerCase();
  if (titleHaystack) {
    let best: { key: DomainKey; len: number } | null = null;
    for (const b of buckets) {
      for (const p of b.processes) {
        const name = (p.name || '').toLowerCase();
        if (name.length < MIN_BP_NAME_LENGTH) continue;
        if (titleHaystack.includes(name)) {
          if (!best || name.length > best.len) best = { key: b.key, len: name.length };
        }
      }
    }
    if (best) return best.key;
  }

  // 3. Classify the combined title + reason + action_type text against
  // the classifier's own domain keywords. This is what catches the
  // common code-level next_action cases — e.g. action_type
  // "create_artifact" naturally matches AI & Intelligence (whose
  // keywords include "artifact"), even when the action title doesn't
  // overlap with any literal BP name.
  const md = nextAction.metadata || {};
  const actionType = typeof md.action_type === 'string' ? md.action_type.replace(/_/g, ' ') : '';
  const composite = [nextAction.title || '', nextAction.reason || '', actionType].filter(Boolean).join(' ');
  const classified = classifyTextToDomain(composite);
  // Only return when the classified domain is actually present in this
  // project's bucket set — never point at a domain that has no rows.
  if (classified && presentKeys.has(classified)) return classified;

  return null;
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
