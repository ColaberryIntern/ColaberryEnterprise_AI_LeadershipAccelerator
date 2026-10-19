import crypto from 'crypto';
import { Op } from 'sequelize';
import { Campaign, CampaignLead, Lead } from '../models';
import { CAMPAIGN_NAME, CAMPAIGN_TYPE } from './aliPersonalOutreachService';
import { enrollLeadsInCampaign } from './campaignService';
import { checkLeadSendable } from './communicationSafetyService';
import { getApolloUsageToday } from './apolloCreditGuard';
import { logActivity } from './activityService';
import {
  CuratedApproval,
  CuratedContact,
  ENROLLABLE_EMAIL_STATUS,
} from '../schemas/curatedEnrollmentSchema';

/**
 * Enroll an approved, hand-curated contact list into the EXISTING executive outreach
 * campaign (C6.6).
 *
 * ## What this does not do
 *
 * It does not talk to Apollo, does not send anything, does not create leads, and does not
 * change a campaign's status. Every one of those already exists somewhere else:
 *
 *   - leads are created by `csvImportService.importLeadsFromCsv`
 *   - enrollment rows are written by `campaignService.enrollLeadsInCampaign`
 *   - sending is `schedulerService` -> `communicationSafetyService.evaluateSend`
 *   - Apollo is `apolloService`, which this file must not modify and does not import
 *
 * The gap this fills is narrow and real: there is no preflight at enrollment time and no
 * record of who approved a list. `enrollLeadsInCampaign` performs no suppression, consent
 * or verification check at all - all of that runs at SEND time - so a curated list enrolled
 * today would write rows and schedule emails for unsubscribed people and only be stopped at
 * the send chokepoint. This refuses them up front instead.
 *
 * ## Why a plan hash
 *
 * Approval is bound to one exact list. `planCuratedEnrollment` is pure and read-only;
 * `executeCuratedEnrollment` recomputes the plan and refuses unless the approval carries a
 * matching hash. Approving a reviewed list and then enrolling a different one is the
 * failure this prevents, and it is not hypothetical: the list is passed in by the caller on
 * both calls.
 *
 * ## Why it refuses instead of truncating
 *
 * C6.5 found that Apollo's ceilings are enforced by returning empty rather than throwing,
 * which at the call site is indistinguishable from "found nobody". A curated run that
 * silently enrolled the first N and dropped the rest would repeat that mistake with a list
 * a human hand-built. Over the cap, this throws.
 */

/** Per-run ceiling. Refusing past it is deliberate; see the header. */
export const MAX_CURATED_PER_RUN = 50;

/** Stable machine-readable refusal codes. Tests assert on these, not on prose. */
export const REJECT_REASONS = {
  UNVERIFIED: 'unverified_contact',
  DUPLICATE_IN_LIST: 'duplicate_in_list',
  LEAD_NOT_FOUND: 'lead_not_found',
  ALREADY_ENROLLED: 'already_enrolled',
  SUPPRESSED: 'suppressed',
} as const;

export class CuratedEnrollmentError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'CuratedEnrollmentError';
  }
}

export type CuratedDecision = {
  email: string;
  leadId: number | null;
  decision: 'enroll' | 'reject';
  reason: string;
};

export type CuratedPlan = {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  /** True when enrolling would schedule sends immediately. The approver needs to know. */
  campaignIsActive: boolean;
  apollo: { count: number; limit: number; readable: boolean };
  decisions: CuratedDecision[];
  counts: { enroll: number; reject: number };
  planHash: string;
};

export type CuratedEnrollmentResult = {
  plan: CuratedPlan;
  enrolled: { leadId: number; status: string }[];
  approvedBy: string;
};

/** Case-insensitive, since `leads` is uniquely indexed on LOWER(email). */
const norm = (email: string) => email.trim().toLowerCase();

/**
 * The hash covers the DECISIONS, not the raw input.
 *
 * Hashing the input would let a contact's company or title change without invalidating the
 * approval. Hashing the decisions means the approval is void the moment the outcome would
 * differ - including when someone unsubscribes between review and execution, which is
 * exactly when it should be void.
 */
function hashDecisions(campaignId: string, decisions: CuratedDecision[]): string {
  const canonical = decisions
    .map((d) => `${norm(d.email)}|${d.leadId ?? ''}|${d.decision}|${d.reason}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(`${campaignId}\n${canonical}`).digest('hex');
}

/** The one campaign this path may touch. Scoping is a requirement, not a convenience. */
async function resolveCampaign() {
  const campaign = await Campaign.findOne({
    where: { name: CAMPAIGN_NAME, type: CAMPAIGN_TYPE },
  });
  if (!campaign) {
    throw new CuratedEnrollmentError(
      'campaign_not_found',
      `No campaign named "${CAMPAIGN_NAME}" of type "${CAMPAIGN_TYPE}"`,
    );
  }
  return campaign;
}

/**
 * Read-only. Produces the full plan and writes nothing: this is the dry run.
 *
 * Gates run in a deliberate order, cheapest and most absolute first, so a contact that is
 * both unverified and unsubscribed is reported as unverified. The reason a human reads
 * should be the one they can act on.
 */
export async function planCuratedEnrollment(contacts: CuratedContact[]): Promise<CuratedPlan> {
  if (contacts.length > MAX_CURATED_PER_RUN) {
    throw new CuratedEnrollmentError(
      'too_many_contacts',
      `${contacts.length} contacts exceeds the per-run ceiling of ${MAX_CURATED_PER_RUN}. `
      + 'Split the list rather than letting the tail be dropped silently.',
    );
  }

  const campaign = await resolveCampaign();
  const usage = await getApolloUsageToday();

  const decisions: CuratedDecision[] = [];
  const seen = new Set<string>();

  for (const contact of contacts) {
    const email = norm(contact.email);
    const push = (decision: 'enroll' | 'reject', reason: string, leadId: number | null = null) => {
      decisions.push({ email, leadId, decision, reason });
    };

    if (contact.emailStatus !== ENROLLABLE_EMAIL_STATUS) {
      push('reject', `${REJECT_REASONS.UNVERIFIED}:${contact.emailStatus}`);
      continue;
    }
    if (seen.has(email)) {
      push('reject', REJECT_REASONS.DUPLICATE_IN_LIST);
      continue;
    }
    seen.add(email);

    // The lead must already exist. Creating one here would be a second lead universe, which
    // the ticket puts out of scope; csvImportService is the intake path.
    const lead = await Lead.findOne({
      where: { email: { [Op.iLike]: email } },
      attributes: ['id'],
    });
    if (!lead) {
      push('reject', REJECT_REASONS.LEAD_NOT_FOUND);
      continue;
    }

    const existing = await CampaignLead.findOne({
      where: { campaign_id: campaign.id, lead_id: lead.id },
      attributes: ['id'],
    });
    if (existing) {
      push('reject', REJECT_REASONS.ALREADY_ENROLLED, lead.id);
      continue;
    }

    // The composite gate: lead status (unsubscribed / dnd / bounced), per-channel
    // unsubscribe events, and test-source leads. It fails closed on a read error.
    const sendable = await checkLeadSendable(lead.id, 'email');
    if (!sendable.sendable) {
      push('reject', `${REJECT_REASONS.SUPPRESSED}:${sendable.reason || 'unknown'}`, lead.id);
      continue;
    }

    push('enroll', 'eligible', lead.id);
  }

  const counts = {
    enroll: decisions.filter((d) => d.decision === 'enroll').length,
    reject: decisions.filter((d) => d.decision === 'reject').length,
  };

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    campaignType: campaign.type,
    campaignIsActive: campaign.status === 'active',
    apollo: { count: usage.count, limit: usage.limit, readable: usage.count >= 0 },
    decisions,
    counts,
    planHash: hashDecisions(campaign.id, decisions),
  };
}

/**
 * Writes. Refuses without a matching approval.
 *
 * It never changes the campaign's status, never calls `activateCampaign`, and never calls
 * `claimApolloCall`. Enrolling into a campaign that is already active will schedule sends -
 * that is what approving it means - and the plan says so in `campaignIsActive` so the
 * approver is deciding with that in front of them.
 */
export async function executeCuratedEnrollment(
  contacts: CuratedContact[],
  approval?: CuratedApproval,
): Promise<CuratedEnrollmentResult> {
  if (!approval) {
    throw new CuratedEnrollmentError(
      'approval_required',
      'Curated enrollment writes nothing without an approval carrying the plan hash.',
    );
  }

  const plan = await planCuratedEnrollment(contacts);

  if (approval.planHash !== plan.planHash) {
    throw new CuratedEnrollmentError(
      'approval_plan_mismatch',
      'The approval does not match this list. Re-run the dry run, review it, and approve '
      + 'the hash it returns.',
    );
  }

  // Fail closed on the quota counter. We spend no credits, but a curated list normally
  // follows an enrichment run, and an exhausted or unreadable counter means the list's
  // provenance may be incomplete. C6.5 is the reason this is not a warning.
  if (!plan.apollo.readable) {
    throw new CuratedEnrollmentError(
      'apollo_quota_unavailable',
      'Apollo usage could not be read. Refusing rather than assuming.',
    );
  }
  if (plan.apollo.limit > 0 && plan.apollo.count >= plan.apollo.limit) {
    throw new CuratedEnrollmentError(
      'apollo_quota_exhausted',
      `Apollo daily usage is ${plan.apollo.count} of ${plan.apollo.limit}.`,
    );
  }

  const toEnroll = plan.decisions.filter((d) => d.decision === 'enroll' && d.leadId !== null);
  if (!toEnroll.length) return { plan, enrolled: [], approvedBy: approval.approvedBy };

  const results = await enrollLeadsInCampaign(
    plan.campaignId,
    toEnroll.map((d) => d.leadId as number),
  );

  // The audit trail. Written per lead, after the fact, best-effort: a logging failure must
  // not leave a lead enrolled with the caller told it failed.
  const byEmail = new Map(contacts.map((c) => [norm(c.email), c]));
  for (const decision of toEnroll) {
    const outcome = results.find((r: any) => r.leadId === decision.leadId);
    const contact = byEmail.get(decision.email);
    try {
      await logActivity({
        lead_id: decision.leadId as number,
        type: 'curated_enrollment',
        subject: `Enrolled in ${plan.campaignName} from an approved curated list`,
        metadata: {
          campaign_id: plan.campaignId,
          plan_hash: plan.planHash,
          approved_by: approval.approvedBy,
          approved_at: approval.approvedAt,
          enrollment_status: outcome?.status || 'unknown',
          contact: contact
            ? {
              email_status: contact.emailStatus,
              verification_source: contact.verificationSource,
              verified_at: contact.verifiedAt,
            }
            : null,
        },
      } as any);
    } catch {
      // Swallowed deliberately and narrowly: the enrollment above already happened.
    }
  }

  return {
    plan,
    enrolled: results.map((r: any) => ({ leadId: r.leadId, status: r.status })),
    approvedBy: approval.approvedBy,
  };
}
