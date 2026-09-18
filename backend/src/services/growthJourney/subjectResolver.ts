import { Sequelize } from 'sequelize';
import { CommunityMember, Enrollment, EnrollmentLead, ExplorerJourneyProfile, Lead, OrgMember, Subscription, Visitor } from '../../models';
import { resolveExplorerLead, normalizeEmail } from '../explorerGrowth/explorerIdentityBridge';
import { getLeadContexts } from '../../modules/tenancy/leadContextService';
import { pickBestEnrollment } from '../enrollmentPick';

/**
 * The generic subject, as a READ-ONLY VIEW over the identity that already
 * exists (§6.2, T204).
 *
 * ─── AD-2: A RESOLVER, NOT A TABLE ──────────────────────────────────────────
 *
 * Identity lives in four tables — `leads`, `enrollments`, `visitors`,
 * `org_members` — with two working bridges between them. A `subjects` table
 * would be a FIFTH identity that has to be kept in sync with all four, and
 * drift between them would be invisible. So this returns a view and owns
 * nothing.
 *
 * ─── IT WRITES NOTHING, AND THAT TOOK CARE RATHER THAN INTENT ───────────────
 *
 * Two of the functions this task was told to reuse WRITE, which is not what
 * their names suggest:
 *
 *   `explorerIdentityBridge.resolveExplorerLead(enrollmentId, { dryRun })`
 *     creates or updates an `explorer_journey_profiles` row unless `dryRun` is
 *     set. It is called here ALWAYS with `{ dryRun: true }`, which is exactly
 *     what that flag exists for: it still performs the email-normalised lead
 *     match — the matching this module must not reimplement — and skips the
 *     persistence.
 *
 *   `visitorTrackingService.resolveIdentity(visitorId, leadId)` IS NOT A
 *     RESOLVER. It returns `void`, it writes `visitor.lead_id` and the reverse
 *     link, and it requires the caller to already know the lead id. The plan
 *     named it as this module's visitor half alongside a "writes no row"
 *     contract; those two cannot both hold, and it yields no identity anyway.
 *     Its service exports no read-only alternative — every identity function
 *     there writes — so the visitor half reads the `Visitor` model directly.
 *     That is not reimplementing matching: the linking is done by the write
 *     path elsewhere, and reading an already-linked row is a query.
 *
 * Recorded rather than quietly worked around, because "reuse the existing
 * bridge" was a deliberate instruction and one half of it turned out to be
 * impossible as written.
 *
 * ─── UNRESOLVED IS NOT THE SAME AS RESOLVED WITH NO HISTORY ─────────────────
 *
 * The result is discriminated. A person who exists but has no brand
 * relationship and no visitor row is `resolved` with empty collections; a
 * person who could not be identified at all is `unresolved` with a reason. A
 * single nullable return would collapse those two, and "we could not identify
 * this person" would start reading as "this person has no history" — which is
 * the difference between asking who someone is and deciding what to send them.
 *
 * ─── THE LEAD → ENROLMENT WALK, AND WHAT A CUSTOMER IS (T407) ──────────────
 *
 * Until T407 a `{ leadId }` anchor never yielded an enrolment, so `isCustomer`
 * was false for every lead-anchored subject and the customer signal was
 * `pipeline_stage = enrolled` alone. The walk now runs three read-only steps,
 * in order, stopping at the first hit: (1) `explorer_journey_profiles.lead_id`
 * (the bridge's own persisted link), (2) `enrollment_leads.email` matched on the
 * normalised address, (3) `enrollments` matched on `LOWER(email)` and deduped
 * through `pickBestEnrollment` (`services/enrollmentPick.ts`, the bridge's rule:
 * mgmt_role > non-explorer > paid > newest), because `enrollments.email` is not
 * unique and a shadow account would otherwise be the one reported. Step 3 reads
 * every status, deliberately: a withdrawn or completed member who paid is still
 * a customer to this run - CUSTOMER is a hard stop (no outreach), which is the
 * conservative direction for someone who once bought.
 *
 * `customer` is a PAID relationship, never "an enrolment exists": every AI
 * Flotation submit mints a guest enrolment, and a guest with a `payment_status`
 * is still a guest (`enrollments.tier` is the access truth, and `payment_status`
 * is not meaningful for guests - the model says so). So `paid` is a non-guest
 * enrolment with `payment_status = 'paid'` (`basis: 'payment_status'`), else an
 * `active` subscription on the enrolment (`basis: 'subscription'`), else
 * `{ paid: false, basis: 'none' }`.
 */

/** Every identity anchor §6.2 permits. At least one is required. */
export interface SubjectAnchor {
  leadId?: number | null;
  enrollmentId?: string | null;
  visitorId?: string | null;
  orgMemberId?: string | null;
}

export type SubjectSource = 'lead' | 'enrollment' | 'visitor' | 'org_member' | 'lead_tenant_context'
  /** T407: HOW a lead anchor reached its enrolment - the profile link, the enrollment_leads bridge, or the email match. */
  | 'explorer_profile' | 'enrollment_lead' | 'enrollment_email';

export type CustomerBasis = 'payment_status' | 'subscription' | 'none';

/** Whether the subject PAYS - never whether an enrolment merely exists. */
export interface CustomerFact {
  paid: boolean;
  basis: CustomerBasis;
}

export const NOT_A_CUSTOMER: CustomerFact = Object.freeze({ paid: false, basis: 'none' });

export type UnresolvedReason =
  /** No anchor at all. §6.2 requires at least one. */
  | 'no_anchor_supplied'
  /** Anchors were supplied, but none matched a row. */
  | 'anchor_not_found'
  /** A lookup threw. Never reported as resolved. */
  | 'lookup_failed';

export interface BrandRelationship {
  tenant_id: string;
  brand_id: string;
  relationship_type: string | null;
  first_touch_at: Date | null;
  last_touch_at: Date | null;
}

export interface SubjectView {
  lead_id: number | null;
  enrollment_id: string | null;
  visitor_id: string | null;
  org_member_id: string | null;
  email_normalized: string | null;
  /**
   * Per-brand relationships from `lead_tenant_contexts`, via
   * `leadContextService`. NOT a second per-brand relationship model — §15's
   * deliverable is "subject AND RELATIONSHIP service", and cycle 1 of the plan
   * omitted this half, which is how a second one gets built.
   *
   * UNFILTERED ACROSS TENANTS, AND THAT IS A HAZARD AT ANY HTTP BOUNDARY. This
   * comes from `getLeadContexts`, whose own doc says callers MUST filter by
   * authorized tenants: a CPN operator opening a lead must not learn the person
   * also has an AI Flotation relationship — the existence of the relationship
   * is itself confidential. This resolver is an internal view and returns all
   * of them. Any route that exposes this field must apply
   * `getAuthorizedLeadContexts` semantics first (filter by the caller's
   * `authorizedTenantIds`, or pass through only for a platform superadmin).
   * T207's participation routes do not expose it; a future one must not
   * without that filter.
   */
  brand_relationships: BrandRelationship[];
  /** T407: the paid relationship, from the enrolment's own payment_status / tier or an active subscription. */
  customer: CustomerFact;
}

export type SubjectResolution =
  | { status: 'resolved'; subject: SubjectView; sources: SubjectSource[] }
  | { status: 'unresolved'; reason: UnresolvedReason };

function hasAnyAnchor(anchor: SubjectAnchor): boolean {
  return Boolean(
    (anchor.leadId ?? null) !== null ||
      anchor.enrollmentId ||
      anchor.visitorId ||
      anchor.orgMemberId,
  );
}

/**
 * Resolve a subject view from one or more identity anchors.
 *
 * Never throws and never writes. A caller on a tracking or page-view path must
 * not acquire a new failure mode, or a new side effect, by asking who somebody
 * is.
 */
export async function resolveSubject(anchor: SubjectAnchor): Promise<SubjectResolution> {
  if (!hasAnyAnchor(anchor)) {
    return { status: 'unresolved', reason: 'no_anchor_supplied' };
  }

  const sources: SubjectSource[] = [];
  let leadId: number | null = anchor.leadId ?? null;
  let enrollmentId: string | null = anchor.enrollmentId ?? null;
  let visitorId: string | null = anchor.visitorId ?? null;
  let orgMemberId: string | null = anchor.orgMemberId ?? null;
  let emailNormalized: string | null = null;

  try {
    // ── enrollment anchor ──────────────────────────────────────────────────
    // `{ dryRun: true }` is load-bearing: without it this call CREATES an
    // explorer profile row, and this module is contracted to write nothing.
    if (enrollmentId) {
      const bridged = await resolveExplorerLead(enrollmentId, { dryRun: true });
      if (bridged.resolved) {
        sources.push('enrollment');
        emailNormalized = bridged.email_normalized || null;
        if (leadId === null && bridged.lead_id !== null) leadId = bridged.lead_id;
      } else {
        // The bridge reports unresolved both for a missing enrollment and for
        // one whose email matches no lead. Distinguish them, so a real
        // enrollment with no lead still counts as an identity.
        const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'email'] });
        if (enrollment) {
          sources.push('enrollment');
          emailNormalized = bridged.email_normalized || null;
        } else {
          enrollmentId = null;
        }
      }
    }

    // ── org member anchor ──────────────────────────────────────────────────
    if (orgMemberId) {
      const member = await OrgMember.findByPk(orgMemberId);
      if (member) {
        sources.push('org_member');
        if (!enrollmentId && member.enrollment_id) {
          // VALIDATED, like a caller-supplied enrollment id would be. A dangling
          // `org_members.enrollment_id` otherwise reached the facade as a
          // resolved learner with an enrollment that does not exist - reported
          // as learner_without_profile, which reads as "not scored yet" rather
          // than "points at nothing". Found by the T206 verifier, fixed here
          // because the anchor is the resolver's to vouch for.
          const inherited = await Enrollment.findByPk(member.enrollment_id, { attributes: ['id'] });
          if (inherited) enrollmentId = member.enrollment_id;
        }
      } else {
        orgMemberId = null;
      }
    }

    // ── visitor anchor ─────────────────────────────────────────────────────
    // A direct read. See the header: the visitor service has no read-only
    // identity function, and its `resolveIdentity` writes.
    if (visitorId) {
      const visitor = await Visitor.findByPk(visitorId);
      if (visitor) {
        sources.push('visitor');
        if (leadId === null && visitor.lead_id !== null) leadId = visitor.lead_id;
      } else {
        visitorId = null;
      }
    }

    // ── lead anchor, and the brand relationships that hang off it ──────────
    if (leadId !== null) {
      const lead = await Lead.findByPk(leadId, { attributes: ['id', 'email'] });
      if (lead) {
        sources.push('lead');
        // Normalised through the SAME function the bridge uses, so the two
        // paths cannot disagree about what the field means. `Lead.email` has no
        // lowercase hook and the unique index is on LOWER(email), so mixed case
        // exists in the table; a field called `email_normalized` carrying a raw
        // value was a promise the lead-only path did not keep.
        if (emailNormalized === null) {
          const raw = (lead as { email?: string | null }).email;
          emailNormalized = raw ? normalizeEmail(raw) || null : null;
        }
      } else {
        // A dangling anchor: the lead id came from a visitor row or the caller,
        // and the lead is gone. Drop it rather than reporting an identity that
        // does not exist.
        leadId = null;
      }
    }

    // ── lead → enrolment (T407): three read-only steps, the first hit wins ──
    if (leadId !== null && enrollmentId === null) {
      const found = await enrollmentForLead(leadId, emailNormalized);
      if (found) {
        enrollmentId = found.enrollmentId;
        sources.push('enrollment', found.via);
      }
    }

    // If nothing matched anywhere, the anchors were real but stale.
    if (sources.length === 0) {
      return { status: 'unresolved', reason: 'anchor_not_found' };
    }

    // Brand relationships are only reachable through a lead. A subject without
    // one is RESOLVED WITH NONE — not unresolved.
    let brandRelationships: BrandRelationship[] = [];
    if (leadId !== null) {
      const contexts = await getLeadContexts(leadId);
      if (contexts.length > 0) sources.push('lead_tenant_context');
      brandRelationships = contexts.map((c) => ({
        tenant_id: c.tenant_id,
        brand_id: c.brand_id,
        relationship_type: c.relationship_type ?? null,
        first_touch_at: c.first_touch_at ?? null,
        last_touch_at: c.last_touch_at ?? null,
      }));
    }

    const customer = enrollmentId ? await customerFactFor(enrollmentId) : NOT_A_CUSTOMER;

    return {
      status: 'resolved',
      subject: {
        lead_id: leadId,
        enrollment_id: enrollmentId,
        visitor_id: visitorId,
        org_member_id: orgMemberId,
        email_normalized: emailNormalized,
        brand_relationships: brandRelationships,
        customer,
      },
      sources,
    };
  } catch (err: unknown) {
    // Fails closed as UNRESOLVED. An identification that could not complete
    // must never be handed back as a successful one.
    //
    // The anchors are deliberately absent from this log line: an enrollment or
    // lead id is a learner identifier, and this module is on a path that runs
    // for ordinary page views.
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'growth-journey-subject-resolver',
        event: 'growth_journey.subject_resolver.lookup_failed',
        outcome: 'failure',
        anchors_supplied: Object.keys(anchor).filter(
          (k) => (anchor as Record<string, unknown>)[k] != null,
        ),
        error_class: (err as { name?: string })?.name ?? 'Error',
        message: (err as { message?: string })?.message,
      }),
    );
    return { status: 'unresolved', reason: 'lookup_failed' };
  }
}

/* ── T407: the walk and the customer fact ──────────────────────────────── */

type EnrolmentVia = 'explorer_profile' | 'enrollment_lead' | 'enrollment_email';

/**
 * The enrolment a lead reaches, by the first of three read-only steps that
 * answers. Step 3 dedupes through the bridge's rule; a step that finds a row
 * with no enrolment on it (an `enrollment_leads` prospect) falls through.
 */
async function enrollmentForLead(leadId: number, emailNormalized: string | null): Promise<{ enrollmentId: string; via: EnrolmentVia } | null> {
  const profile = await ExplorerJourneyProfile.findOne({ where: { lead_id: leadId }, attributes: ['enrollment_id'] });
  const viaProfile = profile?.enrollment_id ?? null;
  if (viaProfile) return { enrollmentId: viaProfile, via: 'explorer_profile' };
  if (!emailNormalized) return null;

  const enrollmentLead = await EnrollmentLead.findOne({
    where: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), emailNormalized),
    attributes: ['enrollment_id'],
    order: [['created_at', 'DESC']],
  });
  const viaLead = enrollmentLead?.enrollment_id ?? null;
  if (viaLead) return { enrollmentId: viaLead, via: 'enrollment_lead' };

  const candidates = await Enrollment.findAll({
    where: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('Enrollment.email')), emailNormalized),
    attributes: ['id', 'email', 'enrollment_type', 'payment_status', 'created_at'],
    include: [{ model: CommunityMember, as: 'communityMember', attributes: ['mgmt_role'], required: false }],
  });
  const best = pickBestEnrollment(candidates as Array<Enrollment & { communityMember?: { mgmt_role?: string | null } | null }>);
  return best ? { enrollmentId: best.id, via: 'enrollment_email' } : null;
}

/** A paid, non-guest enrolment, else an active subscription on it, else not a customer. */
async function customerFactFor(enrollmentId: string): Promise<CustomerFact> {
  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'payment_status', 'tier'] });
  if (enrollment && enrollment.tier !== 'guest' && enrollment.payment_status === 'paid') return { paid: true, basis: 'payment_status' };
  const subscription = await Subscription.findOne({ where: { enrollment_id: enrollmentId, status: 'active' }, attributes: ['id'] });
  if (subscription) return { paid: true, basis: 'subscription' };
  return NOT_A_CUSTOMER;
}

/**
 * Whether a subject has a relationship with one brand.
 *
 * Derived from the same `getLeadContexts` read rather than calling
 * `hasBrandRelationship` separately, so this answer and
 * `subject.brand_relationships` cannot disagree — and one lookup serves both.
 */
export async function subjectHasBrandRelationship(
  anchor: SubjectAnchor,
  tenantId: string,
  brandId: string,
): Promise<boolean> {
  const result = await resolveSubject(anchor);
  if (result.status !== 'resolved') return false;
  return result.subject.brand_relationships.some(
    (r) => r.tenant_id === tenantId && r.brand_id === brandId,
  );
}
