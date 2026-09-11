import { Lead, Enrollment, Visitor, OrgMember } from '../../models';
import { resolveExplorerLead } from '../explorerGrowth/explorerIdentityBridge';
import { getLeadContexts } from '../../modules/tenancy/leadContextService';

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
 */

/** Every identity anchor §6.2 permits. At least one is required. */
export interface SubjectAnchor {
  leadId?: number | null;
  enrollmentId?: string | null;
  visitorId?: string | null;
  orgMemberId?: string | null;
}

export type SubjectSource = 'lead' | 'enrollment' | 'visitor' | 'org_member' | 'lead_tenant_context';

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
   */
  brand_relationships: BrandRelationship[];
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
        if (!enrollmentId && member.enrollment_id) enrollmentId = member.enrollment_id;
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
        emailNormalized = emailNormalized ?? ((lead as { email?: string }).email ?? null);
      } else {
        // A dangling anchor: the lead id came from a visitor row or the caller,
        // and the lead is gone. Drop it rather than reporting an identity that
        // does not exist.
        leadId = null;
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
        relationship_type: (c as { relationship_type?: string | null }).relationship_type ?? null,
        first_touch_at: (c as { first_touch_at?: Date | null }).first_touch_at ?? null,
        last_touch_at: (c as { last_touch_at?: Date | null }).last_touch_at ?? null,
      }));
    }

    return {
      status: 'resolved',
      subject: {
        lead_id: leadId,
        enrollment_id: enrollmentId,
        visitor_id: visitorId,
        org_member_id: orgMemberId,
        email_normalized: emailNormalized,
        brand_relationships: brandRelationships,
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
        event: 'growth_journey.subject_resolver.lookup_failed',
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
