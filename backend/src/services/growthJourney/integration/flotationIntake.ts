import { convertLeadToClient, type ConversionRefusalReason } from '../../delivery/leadConversion';
import { isKillSwitchActive } from '../../launchSafety';

/**
 * The AI Flotation intake: a human's `qualified` / `converted` on a consulting
 * handoff turns the lead into a delivery client through the existing
 * conversion (Phase 4 T406).
 *
 * `convertLeadToClient` is the existing operator action - one transaction for
 * organisation → engagement → identity → project → membership, idempotent on
 * `organizations.lead_id` and `delivery_engagements.source_lead_id` (a second
 * run FINDS and audits `lead.conversion_replayed`), and it sends nothing. Its
 * refusals (`lead_has_no_company`, `lead_has_no_email`, `no_such_lead`,
 * `no_such_brand`) are answered as this writer's own refusal, by the same
 * name: the disposition still records, with the reason on its row.
 *
 * The human who dispositioned is the actor on the audit event and the
 * membership grant (their platform identity when the request carried one);
 * the handoff id is the correlation id, so the delivery trail names the row.
 */

export interface FlotationIntakeInput {
  leadId: number;
  tenantId: string;
  brandId: string;
  actorIdentityId: string | null;
  handoffId: string;
}

export type FlotationIntakeResult =
  | { status: 'refused'; reason: 'kill_switch_active' | ConversionRefusalReason; detail?: string }
  | {
      status: 'written';
      created: boolean;
      organization_id: string;
      engagement_id: string;
      project_id: string;
      identity_id: string;
      membership_id: string;
    };

export async function intakeFlotationClient(input: FlotationIntakeInput): Promise<FlotationIntakeResult> {
  if (await isKillSwitchActive()) return { status: 'refused', reason: 'kill_switch_active' };
  const r = await convertLeadToClient({
    leadId: input.leadId,
    tenantId: input.tenantId,
    brandId: input.brandId,
    actorIdentityId: input.actorIdentityId,
    correlationId: input.handoffId,
  });
  if (r.refused) return { status: 'refused', reason: r.reason, detail: r.detail };
  return {
    status: 'written',
    created: r.created,
    organization_id: r.organizationId,
    engagement_id: r.engagementId,
    project_id: r.projectId,
    identity_id: r.identityId,
    membership_id: r.membershipId,
  };
}
