import { RawCandidateItem } from './sources/caseSourceAdapter';
import { ItemInclusionStatus, MatchReason } from '../../types/inboxCase';

// Clusters scored candidates into distinct business cases, per root
// directive section 5 ("Separate the collected material into distinct
// business cases. Avoid combining unrelated conversations just because the
// same person participated."). Deliberately union-finds on STRONG threading
// signals only (thread id, reply-chain, shared Basecamp reference, or
// subject+participant combo) — never on bare participant overlap or
// semantic similarity alone, so seven emails that all mention the same
// person don't collapse into one case just because they share a sender.

export interface ScoredCandidate extends RawCandidateItem {
  score: number;
  reasons: MatchReason[];
  sourceHash: string;
  inclusionStatus: ItemInclusionStatus;
}

class UnionFind {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

function shareBasecampRef(a: RawCandidateItem, b: RawCandidateItem): boolean {
  if (a.basecamp_refs.length === 0 || b.basecamp_refs.length === 0) return false;
  const bIds = new Set(b.basecamp_refs.map((r) => r.recordingId));
  return a.basecamp_refs.some((r) => bIds.has(r.recordingId));
}

function shareThreadOrReplyChain(a: RawCandidateItem, b: RawCandidateItem): boolean {
  if (a.thread_id && b.thread_id && a.thread_id === b.thread_id) return true;
  if (a.message_id && b.in_reply_to.includes(a.message_id)) return true;
  if (b.message_id && a.in_reply_to.includes(b.message_id)) return true;
  return false;
}

function shareParticipant(a: RawCandidateItem, b: RawCandidateItem): boolean {
  const bSet = new Set(b.participants.map((p) => p.toLowerCase()));
  return a.participants.some((p) => bSet.has(p.toLowerCase()));
}

// The one "medium combo" allowed to merge two items absent explicit
// threading headers: same normalized subject (non-empty) AND at least one
// shared participant. Either alone is insufficient.
function subjectAndParticipantCombo(a: RawCandidateItem, b: RawCandidateItem): boolean {
  if (!a.subject_normalized || a.subject_normalized !== b.subject_normalized) return false;
  return shareParticipant(a, b);
}

function shouldMerge(a: RawCandidateItem, b: RawCandidateItem): boolean {
  return shareThreadOrReplyChain(a, b) || shareBasecampRef(a, b) || subjectAndParticipantCombo(a, b);
}

export function groupCandidates<T extends ScoredCandidate>(candidates: T[]): T[][] {
  const uf = new UnionFind(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (shouldMerge(candidates[i], candidates[j])) {
        uf.union(i, j);
      }
    }
  }

  const clusters = new Map<number, T[]>();
  for (let i = 0; i < candidates.length; i++) {
    const root = uf.find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(candidates[i]);
  }

  return Array.from(clusters.values()).sort((a, b) => {
    const aMax = Math.max(...a.map((c) => c.score));
    const bMax = Math.max(...b.map((c) => c.score));
    return bMax - aMax;
  });
}

// Derives a short human-readable case title from a cluster: prefers the
// most common normalized subject, falling back to the highest-scored item's
// title.
export function deriveCaseTitle(cluster: ScoredCandidate[]): string {
  const subjectCounts = new Map<string, number>();
  for (const c of cluster) {
    if (!c.subject_normalized) continue;
    subjectCounts.set(c.subject_normalized, (subjectCounts.get(c.subject_normalized) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [subj, count] of subjectCounts) {
    if (count > bestCount) {
      best = subj;
      bestCount = count;
    }
  }
  if (best) return best.replace(/\b\w/g, (c) => c.toUpperCase());
  const top = [...cluster].sort((a, b) => b.score - a.score)[0];
  return top?.title || 'Untitled case';
}
