/**
 * T208 — Phase 1's DECISION 5 identifier precedence, declared once and pure.
 *
 * WHY PURE, AND WHY THAT IS A HARD CONSTRAINT RATHER THAN A PREFERENCE.
 * `growthJourney/__tests__/personJourneyService.source.test.ts` asserts an
 * EXACT-EQUALITY import list for `personJourneyService` and separately bans
 * `/subjectResolver/` by name. `personChainService` holds its resolver import
 * LAZY (`await import`) with a positive control proving the guard is real. So a
 * shared resolver that imported models could never be adopted by the very views
 * that need to agree with it. This module therefore imports NOTHING: it decides
 * precedence over an anchor the caller has already loaded.
 *
 * WHAT THIS IS NOT. It is not a fifth identity, not a `persons` spine (Phase 1
 * recorded that as the Phase 6 target and nothing reads it today), and not a
 * replacement for `pickBestEnrollment` — that is the repo's one existing, tested
 * precedence (`mgmt_role > non-explorer > paid > newest`) and callers import it
 * rather than re-encoding it here.
 *
 * THE FOUR LEVELS, and the evidence each rests on:
 *
 *   1. enrollment_id — a journey participant. Stable for the life of the
 *      enrolment, which is why it outranks the lead: the lead a profile resolves
 *      to can CHANGE as identities merge, so keying on it lets one person
 *      acquire a second participation row after a merge
 *      (`models/GrowthJourneyEnrollment.ts` says exactly this).
 *   2. lead_id — a commercial relationship. Present for anyone captured by any
 *      surface, absent for an enrolment that was never a lead (the "86").
 *   3. normalised email — the join key OF LAST RESORT. It is last because it is
 *      the only level that can be wrong: `enrollments` carries no lead, visitor
 *      or person foreign key, so an email match is the sole bridge from
 *      acquisition to enrolment, and it covers ~83% of rows.
 *   4. visitor fingerprint — PRE-REGISTRATION ONLY, which is a statement about
 *      what may be DERIVED, not about when fingerprints are collected. See
 *      `mayDeriveCommercialFacts`.
 */

/** The four levels, strongest first. Order is the contract. */
export const IDENTIFIER_PRECEDENCE = [
  'enrollment_id',
  'lead_id',
  'email_normalized',
  'visitor_fingerprint',
] as const;

export type IdentifierLevel = (typeof IDENTIFIER_PRECEDENCE)[number];

/**
 * An anchor as the callers already hold it. Field names match `SubjectAnchor`
 * and `SubjectView` so no adapter is needed at any call site.
 */
export interface IdentityAnchor {
  enrollmentId?: string | null;
  leadId?: number | null;
  emailNormalized?: string | null;
  visitorId?: string | null;
  orgMemberId?: string | null;
}

/**
 * Which level identifies this anchor, or null when nothing does.
 *
 * `leadId` is checked with an explicit null/undefined test rather than for
 * truthiness, because **lead id 0 is a real id** and `if (anchor.leadId)` would
 * silently drop it — a trap `subjectRef` already documents and a test already
 * pins.
 */
export function identifyingLevel(anchor: IdentityAnchor): IdentifierLevel | null {
  if (anchor.enrollmentId) return 'enrollment_id';
  if (anchor.leadId !== null && anchor.leadId !== undefined) return 'lead_id';
  if (anchor.emailNormalized) return 'email_normalized';
  if (anchor.visitorId) return 'visitor_fingerprint';
  return null;
}

/**
 * The derived subject key, agreeing with both existing builders.
 *
 * `models/GrowthJourneyEnrollment.subjectRef` covers enrollment and lead;
 * `growthJourney/classification/inputs.subjectRefOf` adds `org_member:` and
 * `visitor:`. This produces the same string for every case either of them
 * handles, and a test asserts that against the real functions rather than
 * against a copy of their logic.
 *
 * Email is deliberately NOT a ref prefix. It is a JOIN key, not an identity to
 * write rows against: writing `email:<address>` rows would make a fifth regime,
 * and an address changes hands.
 */
export function subjectRefFrom(anchor: IdentityAnchor): string | null {
  if (anchor.enrollmentId) return `enrollment:${anchor.enrollmentId}`;
  if (anchor.leadId !== null && anchor.leadId !== undefined) return `lead:${anchor.leadId}`;
  if (anchor.orgMemberId) return `org_member:${anchor.orgMemberId}`;
  if (anchor.visitorId) return `visitor:${anchor.visitorId}`;
  return null;
}

/** Every prefix `subjectRefFrom` can emit. The tripwire counts against this. */
export const SUBJECT_REF_PREFIXES = ['enrollment', 'lead', 'org_member', 'visitor'] as const;

/**
 * The inverse, for all FOUR prefixes.
 *
 * `growthJourney/decisionService.anchorFromSubjectRef` parses only `lead:` and
 * `enrollment:`, so every `org_member:`- and `visitor:`-anchored classification
 * is reported as an `unanchored_ref` skip and is permanently undecidable. That
 * is a real defect; it is NOT fixed here, because changing which subjects the
 * nightly runner decides for is a behaviour change outside T208's scope. A test
 * pins the gap so it is a recorded limitation rather than a surprise.
 */
export function anchorFromRef(ref: string): IdentityAnchor | null {
  const at = ref.indexOf(':');
  if (at <= 0) return null;
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (!id) return null;
  if (kind === 'enrollment') return { enrollmentId: id };
  if (kind === 'lead') return /^\d+$/.test(id) ? { leadId: Number(id) } : null;
  if (kind === 'org_member') return { orgMemberId: id };
  if (kind === 'visitor') return { visitorId: id };
  return null;
}

/**
 * May commercial facts — paid state, customer status, a billing relationship —
 * be derived for this anchor?
 *
 * FALSE for a fingerprint-only anchor, and this is the honest form of DECISION
 * 5's "a fingerprint never identifies a person on its own". The literal reading
 * of that rule is already false in production: `portalTrackingController` mints a
 * fingerprint for a SIGNED-IN portal user on purpose (its header records that
 * this is why Explorers were missing from visitor data), and
 * `subjectResolver({ visitorId })` returns a full commercial identity by reading
 * a link somebody else wrote. So the rule is enforced where it can be true — on
 * what may be CONCLUDED from a fingerprint alone — rather than on when
 * fingerprints may be collected.
 */
export function mayDeriveCommercialFacts(anchor: IdentityAnchor): boolean {
  const level = identifyingLevel(anchor);
  return level !== null && level !== 'visitor_fingerprint';
}
