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
import { pathwayStageLabel } from './pathwayStage';

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
 * "Cory's current priority sits in AI & Intelligence (Coordination) —
 *  strengthening it would influence Lead Intelligence (Coordination)
 *  and Execution Systems (Execution)."
 *
 * The parenthetical pathway-stage tags reinforce the same vocabulary
 * the operator sees in each domain row's title bar — one mental model,
 * one operational language. Pathway stage is omitted for the catch-all
 * `other` domain (pathwayStageLabel returns null there); no "(null)"
 * artifacts ever appear.
 *
 * Returns null when there is no priority domain — silence is honest
 * no-signal behavior.
 *
 * Semantic Coherence + Operational Wayfinding Sprint, 2026-05-16:
 * enriched with pathway-stage parentheticals so the leverage block
 * reinforces the topology vocabulary rather than living beside it.
 */
export function whyThisMattersSentence(
  priorityDomain: DomainBucket | null | undefined,
  buckets?: DomainBucket[],
): string | null {
  if (!priorityDomain) return null;
  const priorityWithStage = withStage(priorityDomain.label, priorityDomain.key);

  const downstreamRels = priorityDomain.relationships
    .filter(r => r.verb === 'feeds' || r.verb === 'supports');
  if (downstreamRels.length === 0) {
    return `Cory's current priority sits in ${priorityWithStage}.`;
  }

  // When the caller passes the full bucket list, look up each downstream
  // target's pathway stage too — keeps the parenthetical vocabulary
  // consistent end-to-end. When buckets are absent, fall back to plain
  // labels (existing callers in tests that pass priorityDomain alone
  // still work).
  const bucketByKey = new Map<DomainKey, DomainBucket>();
  if (buckets) for (const b of buckets) bucketByKey.set(b.key, b);

  const downstreamLabels = downstreamRels.map(r => {
    const target = bucketByKey.get(r.targetKey);
    return target ? withStage(r.targetLabel, target.key) : r.targetLabel;
  });
  return `Cory's current priority sits in ${priorityWithStage} — strengthening it would influence ${joinLabels(downstreamLabels)}.`;
}

/**
 * Compose a domain label with its pathway-stage parenthetical, or just
 * the label if the domain has no canonical stage (the catch-all 'other'
 * is the only case where pathwayStageLabel returns null).
 */
function withStage(label: string, key: DomainKey): string {
  const stage = pathwayStageLabel(key);
  return stage ? `${label} (${stage})` : label;
}

function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
