/**
 * caseStudyAdapter — delivery facts in, case study candidate out. PURE, no I/O.
 *
 * Master plan §Gate 15:
 *
 *   DeliveryProject → approved facts → artifacts → evidence → releases →
 *   client acceptance → outcomes → **Case Study candidate**
 *
 * The word doing the work in that chain is **approved**. A case study assembled from
 * whatever is in the database would publish draft decisions, superseded designs and
 * evidence that never passed — a flattering account of work that did not happen that way.
 * So the adapter takes only settled facts, and refuses to produce a candidate at all when
 * the delivery was never accepted.
 *
 * ## It produces a candidate, never a publication
 *
 * `approveForPublication` is a separate call requiring a separate consent, and `publish`
 * does not exist in this module. Gate 15 says publication remains separately approved; the
 * way to make that true is for this code to be structurally incapable of publishing.
 */

import {
  isCaseStudyFact,
  type CaseStudyCandidate,
  type CaseStudyConsent,
  type CaseStudyFact,
} from '../../modules/delivery/caseStudy';

export interface DeliveryFactsInput {
  deliveryProjectId: string;
  clientName?: string | null;
  /** Used whenever the client is not named. "a state transportation agency". */
  clientDescriptor: string;
  consent: CaseStudyConsent;
  /** Only settled, approved facts belong here. The adapter validates the keys. */
  facts: Record<string, unknown>;
}

export interface CandidateRefusal {
  rule: string;
  detail: string;
}

export type CandidateResult =
  | { built: true; candidate: CaseStudyCandidate; warnings: CandidateRefusal[] }
  | { built: false; refusals: CandidateRefusal[] };

const MIN_DESCRIPTOR_LENGTH = 8;

/**
 * Build a case study candidate from approved delivery facts.
 *
 * Refuses when the client never accepted the delivery. Writing a case study about work a
 * client did not sign off is not a marketing shortcut, it is a claim they can contradict —
 * and the person who would contradict it is the client.
 */
export function buildCaseStudyCandidate(input: DeliveryFactsInput): CandidateResult {
  const refusals: CandidateRefusal[] = [];
  const warnings: CandidateRefusal[] = [];

  if (!input.consent.deliveryAccepted) {
    refusals.push({
      rule: 'delivery_not_accepted',
      detail:
        'No client acceptance is recorded for this delivery. A case study about work the ' +
        'client did not sign off is a claim they can contradict.',
    });
  }

  if (!input.clientDescriptor || input.clientDescriptor.trim().length < MIN_DESCRIPTOR_LENGTH) {
    refusals.push({
      rule: 'descriptor_required',
      detail:
        'A descriptor is required even when the client is named, because it is what the ' +
        'study falls back to if name-use permission is later withdrawn.',
    });
  }

  const facts: Partial<Record<CaseStudyFact, unknown>> = {};
  for (const [key, value] of Object.entries(input.facts ?? {})) {
    if (!isCaseStudyFact(key)) {
      // Not a refusal: an unknown key is dropped, which is the safe direction. But it is
      // reported, because silently discarding something the caller thought they were
      // publishing is its own kind of surprise.
      warnings.push({
        rule: 'fact_not_publishable',
        detail: `'${key}' is not a publishable case study fact and was dropped.`,
      });
      continue;
    }
    facts[key] = value;
  }

  if (refusals.length > 0) return { built: false, refusals };

  // Anonymity is decided by consent, never inferred from whether a name happens to be
  // available. A name in the database is not permission to print it.
  const anonymous = !input.consent.nameUseApproved;
  if (anonymous && input.clientName) {
    warnings.push({
      rule: 'name_withheld',
      detail:
        'A client name is on file but name-use was not approved, so the study runs ' +
        'anonymous. This is a supported outcome, not a gap to chase.',
    });
  }

  return {
    built: true,
    warnings,
    candidate: {
      deliveryProjectId: input.deliveryProjectId,
      status: 'draft_candidate',
      clientName: anonymous ? null : (input.clientName ?? null),
      clientDescriptor: input.clientDescriptor.trim(),
      facts,
      anonymous,
    },
  };
}

export interface PublicationRefusal {
  rule: string;
  detail: string;
}

export type PublicationResult =
  | { approved: true; candidate: CaseStudyCandidate }
  | { approved: false; refusals: PublicationRefusal[] };

/**
 * Move a candidate to `approved_for_publication`.
 *
 * A separate call with a separate consent, because delivery acceptance is not publication
 * consent — different decision, different person, different timescale. This is the whole
 * reason `CaseStudyConsent` carries three independent flags rather than one.
 */
export function approveForPublication(
  candidate: CaseStudyCandidate,
  consent: CaseStudyConsent,
): PublicationResult {
  const refusals: PublicationRefusal[] = [];

  if (candidate.status !== 'draft_candidate') {
    refusals.push({
      rule: 'not_a_draft',
      detail: `Candidate is '${candidate.status}'; only a draft can be approved.`,
    });
  }

  if (!consent.publicationApproved) {
    refusals.push({
      rule: 'publication_not_approved',
      detail:
        'The client accepted the delivery but has not approved publication. Those are ' +
        'different decisions.',
    });
  }

  if (!consent.publicationApprovedByIdentityId) {
    refusals.push({
      rule: 'approver_not_recorded',
      detail:
        'Publication consent must record who gave it. "Someone said it was fine" is not a ' +
        'record anyone can rely on when the client asks a year later.',
    });
  }

  // A named study needs both consents. Publication permission alone permits the anonymous
  // version, not the one with a logo on it.
  if (!candidate.anonymous && !consent.nameUseApproved) {
    refusals.push({
      rule: 'name_use_not_approved',
      detail: 'Candidate names the client, but name-use consent is absent.',
    });
  }

  if (refusals.length > 0) return { approved: false, refusals };

  return { approved: true, candidate: { ...candidate, status: 'approved_for_publication' } };
}
