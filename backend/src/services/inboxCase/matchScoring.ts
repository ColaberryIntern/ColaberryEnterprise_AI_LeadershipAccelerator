import { MatchReason, MatchReasonKind, bandForScore, ItemInclusionStatus } from '../../types/inboxCase';

// Deterministic, explainable weighted-evidence scoring, per root directive
// section 6 ("Connect"). Every included/candidate item must show its score
// and reasons — this module IS that computation, mirroring the house
// pattern already used for email opportunity scoring
// (services/inbox/opportunityScoringService.ts).

// Positive-signal weights (0-1, combined via noisy-OR below so multiple
// weak signals stack without any single one dominating past its own
// ceiling). Strong/exact signals sit at or near 1.0 so a single one is
// enough to auto-include; medium signals need to combine; weak signals are
// capped well under the 0.65 candidate floor on their own.
const REASON_WEIGHTS: Record<MatchReasonKind, number> = {
  // Strong signals per root directive section 6 — each alone crosses the
  // 0.85 auto-include threshold. Note "exact email address" and "exact
  // Basecamp person ID" are classified STRONG in the directive, not medium.
  exact_thread_id: 1.0,
  exact_message_id_reference: 0.95,
  exact_basecamp_url: 0.95,
  exact_basecamp_recording_id: 0.9,
  exact_email_address: 0.88,
  exact_basecamp_person_id: 0.88,
  exact_normalized_company_or_project: 0.87,
  // Medium signals — a single one alone stays below the 0.65 candidate
  // floor (weak corroboration only), but any two combine past it via the
  // noisy-OR below, matching "candidate requiring review."
  same_participants: 0.45,
  same_normalized_subject: 0.45,
  name_alias: 0.4,
  close_date: 0.15,
  matching_attachment_name: 0.4,
  same_basecamp_project: 0.35,
  // Weak signals — deliberately low so semantic-only or generic-terminology
  // matches cannot reach the 0.65 candidate floor even stacked three deep.
  semantic_similarity: 0.2,
  generic_terminology: 0.15,
  ambiguous_first_name_only: 0.15,
  // Auto-sync items are never scored via this module at all (caseAutoSyncService.ts
  // sets score=1 and inclusionStatus='INCLUDED' directly) — this weight only
  // exists to satisfy the exhaustive Record type and is never actually read.
  auto_synced_from_inbox: 1.0,
};

export interface ScoredMatch {
  score: number;
  reasons: MatchReason[];
  inclusionStatus: ItemInclusionStatus;
}

export function weightFor(kind: MatchReasonKind): number {
  return REASON_WEIGHTS[kind];
}

// Combines independent positive-evidence weights via noisy-OR
// (1 - Π(1 - w_i)) rather than a capped sum, so:
//  - a single strong signal (weight ~0.9-1.0) alone crosses auto-include,
//  - several medium signals together can cross auto-include,
//  - several weak-only signals still top out well under the candidate floor
//    (three 0.2 weak signals combine to only ~0.49, still short of 0.65).
export function combineReasons(reasons: MatchReason[]): number {
  if (reasons.length === 0) return 0;
  let product = 1;
  for (const r of reasons) {
    const w = Math.max(0, Math.min(1, r.weight));
    product *= 1 - w;
  }
  return Math.round((1 - product) * 1000) / 1000;
}

export function scoreCandidate(reasons: MatchReason[]): ScoredMatch {
  const score = combineReasons(reasons);
  return { score, reasons, inclusionStatus: bandForScore(score) };
}

export function buildReason(kind: MatchReasonKind, detail: string): MatchReason {
  return { kind, detail, weight: weightFor(kind) };
}
