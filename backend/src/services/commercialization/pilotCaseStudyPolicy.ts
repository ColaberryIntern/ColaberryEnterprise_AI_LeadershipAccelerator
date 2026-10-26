/**
 * C8.7 — how a finished pilot becomes a case study, and where it must stop.
 *
 * THE FINDING THIS FILE EXISTS TO ENCODE: a pilot outcome cannot become a PUBLISHED case
 * study today, and the two systems that decide it already agree on why.
 *
 *   - The publish gate requires maturity `operational_result`
 *     (caseStudyPublishMaturityRule.ts:38, PUBLISHABLE_FROM).
 *   - `operational_result` is documented UNREACHABLE because it "needs an outcome
 *     measured through an approved measurement definition", and no measurement-definition
 *     concept exists in the codebase (caseStudyFoundation.ts:41, OUTCOME_WHY at :119).
 *   - C7.6, the pilot measurement spec, DELIBERATELY DECLINED to measure business outcome
 *     in money or time, because a twelve-week pilot inside a large organization cannot be
 *     separated from everything else that moved.
 *
 * So the ladder is not blocking a pilot by oversight. It is asking for exactly the claim
 * C7.6 refused to make. A pilot produces a build record and, at best, a capability
 * demonstration. Engineering around that would publish an impact claim nobody measured,
 * which is the failure C8.7 names: "publishing an outcome that does not meet the existing
 * maturity rules. Respect the ladder."
 *
 * THE TRAP THIS FILE PREVENTS. A pilot-sourced case study that sets `project_id` becomes
 * PERMANENTLY unpublishable, which is worse than being blocked. `foundationFor`
 * (caseStudyPublicationService.ts:231) returns non-null whenever `project_id` is set or a
 * cited repository resolves to a student project; the maturity rule is a deliberate no-op
 * when foundation is absent (caseStudyPublishMaturityRule.ts:45) and activates when it is
 * not. Activated, it demands a rung `computeMaturity` can never return. An engagement is
 * not a student project, so the honest answer and the safe one coincide: do not set it.
 */

/** The `source_type` for an engagement-sourced study. Already in the union, unused. */
export const ENGAGEMENT_SOURCE_TYPE = 'engagement';

/** The rung a pilot can actually reach today, and the one it cannot. */
export const MATURITY_CEILING_TODAY = 'capability_demonstration';
export const PUBLISHABLE_FROM = 'operational_result';

/**
 * The two axes the engine actually uses. There is no single "provenance" enum: a figure
 * carries a CLASS (how much may be shown) and a METHOD (who checked it), and the gate
 * refuses `class: 'verified'` with `method: 'self'` outright rather than discounting it.
 */
export type VerificationClass = 'verified' | 'anonymized' | 'illustrative' | 'pending';
export type VerificationMethod = 'client' | 'repo' | 'platform' | 'internal' | 'self' | 'manual';

export interface MeasureMapping {
  /** The measure as C7.6 names it. */
  measure: string;
  /** C7.6's attribution strength for it. */
  attribution: 'strong' | 'partial' | 'weak' | 'declined';
  /** Null when the measure must never reach a case study at all. */
  verification: { class: VerificationClass; method: VerificationMethod } | null;
  /** May this become a metric marked publishable on a case study? */
  publishable: boolean;
  /** Why, in a sentence a reviewer can check. */
  why: string;
  /**
   * The caveat that must travel IN THE SENTENCE CARRYING THE NUMBER, per C7.6's
   * publication rule - not in a footnote and not at review time.
   */
  inlineCaveat: string | null;
}

/**
 * C7.6's five measures, mapped onto the engine's axes.
 *
 * The mapping is the integration. There is no new provenance kind to invent: every one
 * of these lands in slots the engine already has.
 */
export const MEASURE_MAPPINGS: readonly MeasureMapping[] = [
  {
    measure: 'What each named person built',
    attribution: 'strong',
    verification: { class: 'verified', method: 'repo' },
    publishable: true,
    why: 'The commit link is checkable by a stranger with no account. C5.0 probed 213 of '
      + 'these and 212 resolved anonymously, which is why this is the only measure C7.6 '
      + 'rates strong and the only one that needs no hedge.',
    inlineCaveat: null,
  },
  {
    measure: 'Capability change per participant',
    attribution: 'partial',
    verification: { class: 'verified', method: 'platform' },
    publishable: true,
    why: 'The same instrument twelve weeks apart genuinely measures change, so it is '
      + 'verified rather than illustrative. What it cannot do is isolate our contribution.',
    inlineCaveat: 'measured on the same instrument twelve weeks apart, which does not '
      + 'isolate our contribution',
  },
  {
    measure: 'Progress on the sponsor’s named business problems',
    attribution: 'partial',
    verification: { class: 'verified', method: 'client' },
    publishable: true,
    why: 'The sponsor rates their own problem against their own written baseline. That is '
      + 'the right person and an interested one, so the rating is recorded with who gave '
      + 'it and that they owned the problem.',
    inlineCaveat: 'rated by the sponsor against their own baseline, as the owner of the '
      + 'problem being rated',
  },
  {
    measure: 'Internal verification status of completed work',
    attribution: 'weak',
    verification: { class: 'illustrative', method: 'internal' },
    publishable: false,
    why: 'Of 2,339 verification records in production, 1,624 are partial and 715 are not '
      + 'verified. NONE is fully verified. Re-counted 24 October 2026 and unchanged. It '
      + 'is our own assessment of our own learners’ work and is currently incomplete, '
      + 'so it may inform a draft but must not be a published figure.',
    inlineCaveat: 'our own internal assessment, currently incomplete, and never '
      + 'independent verification',
  },
  {
    measure: 'Business outcome in money or time saved',
    attribution: 'declined',
    verification: null,
    publishable: false,
    why: 'C7.6 declined to measure it at all: a twelve-week pilot touching a handful of '
      + 'problems inside a large organization cannot be separated from everything else '
      + 'that moved. It has no verification mapping because there is nothing to map - a '
      + 'number that was never measured cannot be given a class.',
    inlineCaveat: null,
  },
];

/** What a delivery may export, per the existing (unwired) delivery adapter allowlist. */
export const EXPORTABLE_FACTS: readonly string[] = [
  'problem_statement', 'approach_summary', 'requirements_count', 'stories_delivered',
  'release_count', 'elapsed_delivery_time', 'evidence_summary',
  'client_acceptance_recorded', 'outcome_summary',
];

export interface EngagementCaseStudySeed {
  sourceType: string;
  projectId: string | null;
  status: string;
  visibility: string;
  organizationIdentityMode: string;
  organizationNamingConsent: boolean;
}

/**
 * The row an engagement-sourced case study is born as.
 *
 * Every consent-bearing column keeps its schema default, so the record fails closed by
 * construction: hidden, unconsented, private, draft. Granting consent stays a human act
 * through the admin PATCH, which is where the engine already puts it.
 */
export function engagementSeed(): EngagementCaseStudySeed {
  return {
    sourceType: ENGAGEMENT_SOURCE_TYPE,
    // NOT a student project. See the header: setting this makes the record permanently
    // unpublishable by activating a rule that cannot be satisfied.
    projectId: null,
    status: 'draft',
    visibility: 'private',
    organizationIdentityMode: 'hidden',
    organizationNamingConsent: false,
  };
}

/* ------------------------------------------------------------------ *
 * Guards - the acceptance criteria as assertions
 * ------------------------------------------------------------------ */

/**
 * "Respects the publish maturity ladder."
 *
 * The ceiling a pilot can reach must stay BELOW the publishable rung. If a later change
 * makes them equal, this build fails rather than the ladder quietly admitting a pilot.
 */
export function assertPilotCannotReachPublishable(): void {
  const LADDER = ['story_hypothesis', 'build_record', 'capability_demonstration',
    'operational_result', 'impact_case_study'];
  const ceiling = LADDER.indexOf(MATURITY_CEILING_TODAY);
  const publishable = LADDER.indexOf(PUBLISHABLE_FROM);
  if (ceiling < 0 || publishable < 0) throw new Error('a rung name is not on the ladder');
  if (ceiling >= publishable) {
    throw new Error('a pilot would reach the publishable rung without an approved '
      + 'measurement definition, which is the claim C7.6 declined to make');
  }
}

/**
 * The measure C7.6 declined must be unrepresentable, not merely discouraged.
 *
 * It carries no verification mapping at all, because giving it a class would make it
 * look like a figure that simply has not been checked yet rather than one that was never
 * measured and never will be under this spec.
 */
export function assertDeclinedMeasureCannotBePublished(): MeasureMapping {
  const declined = MEASURE_MAPPINGS.find((m) => m.attribution === 'declined');
  if (!declined) throw new Error('C7.6 declined a measure and the mapping has lost it');
  if (declined.publishable) throw new Error(`${declined.measure} is marked publishable`);
  if (declined.verification !== null) {
    throw new Error(`${declined.measure} has a verification mapping; a measure that was `
      + 'never taken cannot be given a class');
  }
  return declined;
}

/** A self-attested figure can never be verified - the gate refuses it outright. */
export function assertNoSelfAttestedVerification(): void {
  for (const m of MEASURE_MAPPINGS) {
    if (m.verification?.class === 'verified' && m.verification.method === 'self') {
      throw new Error(`${m.measure} claims verified by self-attestation, which the publish `
        + 'gate refuses rather than discounts');
    }
  }
}

/**
 * C7.6's publication rule: where attribution is partial or weak, the caveat travels in
 * the sentence carrying the number. So every non-strong measure must HAVE that sentence.
 */
export function assertCaveatsTravelWithTheNumber(): number {
  let withCaveat = 0;
  for (const m of MEASURE_MAPPINGS) {
    const needsOne = m.attribution === 'partial' || m.attribution === 'weak';
    if (needsOne && (!m.inlineCaveat || m.inlineCaveat.length < 20)) {
      throw new Error(`${m.measure} is ${m.attribution} and carries no inline caveat`);
    }
    if (m.inlineCaveat) withCaveat += 1;
  }
  return withCaveat;
}

/** An engagement-sourced study must never carry a project id. */
export function assertSeedCannotBecomeUnpublishable(): void {
  const seed = engagementSeed();
  if (seed.projectId !== null) {
    throw new Error('an engagement seed set project_id, which activates a maturity rule '
      + 'that can never be satisfied and makes the record permanently unpublishable');
  }
  if (seed.sourceType !== ENGAGEMENT_SOURCE_TYPE) {
    throw new Error('an engagement seed must declare itself as such');
  }
}

/** The seed must fail closed: nothing named, nothing public, nothing consented. */
export function assertSeedFailsClosed(): void {
  const s = engagementSeed();
  if (s.organizationNamingConsent !== false) throw new Error('seed grants naming consent');
  if (s.organizationIdentityMode !== 'hidden') throw new Error('seed is not hidden');
  if (s.visibility !== 'private') throw new Error('seed is not private');
  if (s.status !== 'draft') throw new Error('seed is not a draft');
}
