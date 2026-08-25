/**
 * caseStudy — turning delivered work into a publishable story. PURE, no I/O.
 *
 * Master plan §Gate 15: the Case Study OS consumes **approved** delivery facts through an
 * adapter, publication remains **separately approved**, and:
 *
 *   > Do not put private client facts in marketing analytics payloads.
 *
 * ## Delivery acceptance is not publication consent
 *
 * This is the distinction the whole module turns on, and it is the one most likely to be
 * lost. A client accepting a release is saying *"this is what we asked for."* It is not
 * saying *"use our name in your marketing."* Those are different decisions, made by
 * different people on different timescales — the acceptance often by a technical owner, the
 * publication permission by someone in communications or legal who has never seen the
 * project.
 *
 * Conflating them is not a hypothetical risk; it is the default outcome of any design where
 * one approval flag gates both. So `CaseStudyCandidate` carries two independent consents
 * and cannot be published on the strength of the delivery one.
 *
 * ## Anonymous is a first-class outcome, not a failure
 *
 * A client who will not be named can still be written about — "a state transportation
 * agency" is a real and useful case study. Modelling anonymity as a supported mode rather
 * than a degraded one means the honest choice is also the easy one, instead of creating
 * pressure to chase a name-use permission that was never given.
 */

/** Facts a case study may draw on. Everything else stays inside the delivery surface. */
export type CaseStudyFact =
  | 'problem_statement'
  | 'approach_summary'
  | 'requirements_count'
  | 'stories_delivered'
  | 'release_count'
  | 'elapsed_delivery_time'
  | 'evidence_summary'
  | 'client_acceptance_recorded'
  | 'outcome_summary';

export const CASE_STUDY_FACTS: readonly CaseStudyFact[] = [
  'problem_statement',
  'approach_summary',
  'requirements_count',
  'stories_delivered',
  'release_count',
  'elapsed_delivery_time',
  'evidence_summary',
  'client_acceptance_recorded',
  'outcome_summary',
];

export function isCaseStudyFact(value: string): value is CaseStudyFact {
  return (CASE_STUDY_FACTS as readonly string[]).includes(value);
}

/**
 * Two independent consents. Neither implies the other.
 *
 * `deliveryAccepted` comes from `delivery_client_acceptances` (Gate 10). `publication` is a
 * separate act, recorded with who gave it, because "someone said it was fine" is not a
 * record anyone can rely on a year later when the client's comms team asks who approved it.
 */
export interface CaseStudyConsent {
  /** The client accepted the work. Necessary, nowhere near sufficient. */
  deliveryAccepted: boolean;
  /** The client agreed this may be published at all. */
  publicationApproved: boolean;
  /** The client agreed to be NAMED. Absent this, the study runs anonymous. */
  nameUseApproved: boolean;
  publicationApprovedByIdentityId?: string | null;
}

export type CaseStudyStatus = 'draft_candidate' | 'approved_for_publication' | 'published';

export interface CaseStudyCandidate {
  deliveryProjectId: string;
  status: CaseStudyStatus;
  /** Null whenever `nameUseApproved` is false. Never "helpfully" inferred. */
  clientName: string | null;
  /** e.g. "a state transportation agency". Used when the client is not named. */
  clientDescriptor: string;
  facts: Partial<Record<CaseStudyFact, unknown>>;
  anonymous: boolean;
}

/**
 * Field fragments that identify a client, beyond the forbidden categories Gate 10 already
 * catches.
 *
 * Gate 10's `findForbiddenFields` guards mentor notes, scratchpads, secrets and logs. This
 * list is different: these are fields that are perfectly legitimate on the delivery surface
 * and become a disclosure the moment they reach a marketing payload.
 */
const CLIENT_IDENTIFYING_FRAGMENTS = [
  'client_name',
  'clientname',
  'organization_name',
  'organisation_name',
  'company_name',
  'contact_email',
  'contact_name',
  'engagement_id',
  'delivery_project_id',
  'contract_value',
  'contract_amount',
  'repo_url',
  'repository_url',
  'preview_ref',
  'preview_url',
];

export interface AnalyticsLeak {
  path: string;
  fragment: string;
}

/**
 * Find client-identifying fields in a payload bound for marketing analytics.
 *
 * Depth-limited, and a truncated walk reports a hit rather than returning clean — same
 * discipline as Gate 10's tripwire, for the same reason: an incomplete check that answers
 * "clean" is worse than no check.
 */
export function findClientIdentifiers(value: unknown, maxDepth = 8): AnalyticsLeak[] {
  const hits: AnalyticsLeak[] = [];

  const walk = (node: unknown, path: string, depth: number): void => {
    if (node === null || typeof node !== 'object') return;
    if (depth > maxDepth) {
      hits.push({ path, fragment: '(walk truncated)' });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      for (const fragment of CLIENT_IDENTIFYING_FRAGMENTS) {
        if (lowered.includes(fragment)) {
          hits.push({ path: path ? `${path}.${key}` : key, fragment });
        }
      }
      walk(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };

  walk(value, '', 0);
  return hits;
}

export interface AnalyticsRefusal {
  rule: string;
  detail: string;
}

/**
 * Guard a marketing analytics payload.
 *
 * Refuses rather than strips. Gate 10's client projection strips, because there the request
 * is legitimate and only some fields are not. Here the *whole payload* is suspect: an
 * analytics event carrying `client_name` was built by code that thinks client identity
 * belongs in analytics, and silently removing the field would leave that code in place to
 * do it again somewhere this guard is not.
 */
export function guardAnalyticsPayload(payload: unknown): AnalyticsRefusal[] {
  const hits = findClientIdentifiers(payload);
  if (hits.length === 0) return [];

  return [
    {
      rule: 'client_facts_in_analytics',
      detail:
        'Marketing analytics payload contains client-identifying fields: ' +
        `${hits.map((h) => h.path).join(', ')}. Master plan §Gate 15 forbids private client ` +
        'facts in marketing analytics.',
    },
  ];
}
