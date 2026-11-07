/**
 * goldGate — v3 §V2, T13. The PURE logic for the single human gate. Gold is the one place a person decides: when
 * every eligible document passes its checks (no fatal, full pass rule) the aggregator surfaces ONE `approval` need —
 * the package Go/No-go — and nothing else about Gold is automated. Once every eligible document's Gold gate is
 * approved there is nothing left to ask, so the need disappears. No I/O; the aggregator feeds it the per-document
 * pass + gold-approval state.
 */
import type { HumanNeed } from './proposalReviewTypes';

export interface GoldDocState {
  docKey: string;
  /** The document's current version passes the full check rule (which already means no fatal). */
  passes: boolean;
  /** A superseded (no-longer-required) document is excluded from the Gold decision. */
  superseded?: boolean;
  /** The document's Gold gate is already approved at its current version. */
  goldApproved?: boolean;
}

const eligibleDocs = (docs: GoldDocState[]): GoldDocState[] => (Array.isArray(docs) ? docs : []).filter((d) => d && d.docKey && !d.superseded);

/** PURE: the project is Gold-ready when there is at least one eligible document and EVERY eligible one passes. */
export function goldReady(docs: GoldDocState[]): boolean {
  const eligible = eligibleDocs(docs);
  return eligible.length > 0 && eligible.every((d) => d.passes);
}

/** PURE: every eligible document's Gold gate is already approved — nothing left to decide. */
export function goldFullyApproved(docs: GoldDocState[]): boolean {
  const eligible = eligibleDocs(docs);
  return eligible.length > 0 && eligible.every((d) => d.goldApproved);
}

/** PURE: the single Gold package approval need, used-in every eligible document. */
export function goldApprovalNeed(docKeys: string[]): HumanNeed {
  return {
    kind: 'approval',
    key: 'approval:gold',
    ask: 'Give the package a final Go for submission (the Gold gate).',
    why: 'Every document passes its checks with no fatal issues; the package needs one human Go before it ships.',
    usedIn: (Array.isArray(docKeys) ? docKeys : []).filter(Boolean).map((k) => ({ docKey: k })),
    format: 'Go (approve) or No-go (return with a note)',
    blocking: 'score',
  };
}

/** PURE: the Gold approval need to surface, or null when the project is not ready yet or already fully approved. */
export function goldNeedFor(docs: GoldDocState[]): HumanNeed | null {
  if (!goldReady(docs) || goldFullyApproved(docs)) return null;
  return goldApprovalNeed(eligibleDocs(docs).map((d) => d.docKey));
}
