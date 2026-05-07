/**
 * remediationSequencePlanner — given a list of IssueClusters, return the
 * order remediation should be tackled in, with reasoning.
 *
 * The TYPE_ORDER table is the deterministic spine: accessibility before
 * hierarchy before navigation before CTA before spacing before workflow
 * before cognition_overload. Within a type, severity breaks ties (high
 * before medium before low). Within severity, larger issue_count breaks
 * ties (a 6-issue cluster gets surfaced before a 1-issue cluster of the
 * same type/severity).
 *
 * Phase 10.5 §A.2.
 */

import type { IssueCluster } from './issueClusterEngine';

export interface SequencedCluster {
  readonly cluster_signature: string;
  readonly position: number;            // 1-indexed
  readonly reason: string;
}

export interface RemediationSequencePlan {
  readonly ordered_clusters: ReadonlyArray<SequencedCluster>;
  readonly reasoning: ReadonlyArray<string>;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function planRemediationSequence(clusters: ReadonlyArray<IssueCluster>): RemediationSequencePlan {
  if (clusters.length === 0) {
    return { ordered_clusters: [], reasoning: ['No open clusters — nothing to sequence.'] };
  }

  const sorted = [...clusters].sort((a, b) => {
    if (a.remediation_priority !== b.remediation_priority) {
      return a.remediation_priority - b.remediation_priority;
    }
    const sa = SEVERITY_ORDER[a.severity] ?? 1;
    const sb = SEVERITY_ORDER[b.severity] ?? 1;
    if (sa !== sb) return sa - sb;
    return b.issue_count - a.issue_count;
  });

  const ordered_clusters: SequencedCluster[] = sorted.map((c, i) => ({
    cluster_signature: c.cluster_signature,
    position: i + 1,
    reason: explain(c, i, sorted),
  }));

  const reasoning: string[] = [];
  reasoning.push('Sequence rule: accessibility → hierarchy → navigation → CTA → spacing → workflow → cognition_overload.');
  reasoning.push('Within the same type, higher severity goes first; ties broken by larger issue_count.');
  if (sorted[0]) {
    reasoning.push(`First: ${sorted[0].cluster_type} cluster on ${sorted[0].page_route} (${sorted[0].issue_count} issue${sorted[0].issue_count === 1 ? '' : 's'}, ${sorted[0].severity}).`);
  }
  if (sorted.length > 1) {
    const lastIdx = sorted.length - 1;
    reasoning.push(`Last: ${sorted[lastIdx].cluster_type} on ${sorted[lastIdx].page_route} — lowest priority class in this set.`);
  }

  return { ordered_clusters, reasoning };
}

function explain(c: IssueCluster, idx: number, all: ReadonlyArray<IssueCluster>): string {
  const prior = idx === 0 ? null : all[idx - 1];
  if (!prior) {
    return `Top of queue — ${c.cluster_type} fixes precede everything else by sequence rule.`;
  }
  if (prior.remediation_priority === c.remediation_priority) {
    if (SEVERITY_ORDER[c.severity] > SEVERITY_ORDER[prior.severity]) {
      return `Same type as previous (${c.cluster_type}), but lower severity (${c.severity} vs ${prior.severity}).`;
    }
    return `Same type + severity as previous (${c.cluster_type} ${c.severity}); ordered by issue count.`;
  }
  return `${c.cluster_type} comes after ${prior.cluster_type} per the sequence rule.`;
}
