/**
 * leadConversion — turn a marketing lead into a delivery client, in one audited step.
 *
 * ## The gap this closes
 *
 * Leads arrive from the public sites and land in `leads`. Delivery work happens against
 * an engagement, a project and a client membership. Nothing joined the two, which is the
 * whole reason production holds zero engagements: a client could be captured and could
 * never be delivered to, because the five rows in between had no writer.
 *
 * The chain is: organization -> engagement -> identity -> project -> membership.
 *
 * ## Every judgement lives in leadConversionPlan
 *
 * This module loads rows, asks the planner what should exist, and writes the difference.
 * It holds no opinion about naming, validity or reuse - which is what lets those be
 * tested without a database, the way every other delivery test in this codebase is.
 *
 * ## Idempotency is anchored in the schema, not in a new table
 *
 * `organizations.lead_id` and `delivery_engagements.source_lead_id` already exist and
 * already mean "this row came from that lead". Re-running therefore FINDS rather than
 * creates, and returns the same five ids with `created: false`.
 *
 * That matters more here than in most places. This is an operator action fired from a
 * screen, and the natural human response to an uncertain result is to click it again. A
 * conversion that produced a second organization and a second engagement on the second
 * click would be discovered weeks later as duplicate client records, by which point real
 * delivery work would be hanging off both.
 *
 * ## All five rows, or none
 *
 * Everything runs in one transaction. A half-converted lead - an engagement whose client
 * cannot sign in - is worse than an unconverted one, because it looks converted. A run
 * that died part-way is completed rather than reported as done; see `createsAnything`.
 *
 * ## What it deliberately does NOT do
 *
 * It sends no email. Nothing here tells the client anything; inviting them is a separate,
 * outward-facing act that belongs to whoever decides the timing. It also never mutates
 * the lead row: the lead is the marketing record and stays the marketing record.
 */
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import Brand from '../../models/Brand';
import DeliveryEngagement from '../../models/DeliveryEngagement';
import DeliveryEvent from '../../models/DeliveryEvent';
import DeliveryProject from '../../models/DeliveryProject';
import DeliveryProjectMember from '../../models/DeliveryProjectMember';
import Lead from '../../models/Lead';
import Organization from '../../models/Organization';
import PlatformIdentity from '../../models/PlatformIdentity';
import { DELIVERY_ROLES } from '../../modules/delivery/deliveryRoles';
import {
  planConversion,
  type ConversionPlan,
  type ConversionRefusal,
  type ExistingChain,
} from './leadConversionPlan';

export type { ConversionRefusal, ConversionRefusalReason } from './leadConversionPlan';

export interface ConversionResult {
  refused: false;
  /** False when this lead was already fully converted - the ids are the original ones. */
  created: boolean;
  organizationId: string;
  engagementId: string;
  identityId: string;
  projectId: string;
  membershipId: string;
}

export interface ConvertLeadInput {
  leadId: number;
  tenantId: string;
  /** The brand delivering the work. Null is allowed; the client room then shows no brand. */
  brandId?: string | null;
  /** Whoever pressed the button. Recorded on the audit event and the membership grant. */
  actorIdentityId?: string | null;
  correlationId?: string;
  engagementName?: string;
  projectName?: string;
}

/**
 * Everything already written for this lead.
 *
 * The identity is matched case-insensitively because the same human types `Dana@x.com` on
 * one form and `dana@x.com` on the next, and two identities for one person means two sets
 * of memberships and a client who can see half their own project.
 */
async function loadExisting(lead: Lead, tx: Transaction): Promise<ExistingChain & {
  organization?: Organization; engagement?: DeliveryEngagement;
  identity?: PlatformIdentity; project?: DeliveryProject;
}> {
  const [organization, engagement, identity] = await Promise.all([
    Organization.findOne({ where: { lead_id: lead.id }, transaction: tx }),
    DeliveryEngagement.findOne({ where: { source_lead_id: lead.id }, transaction: tx }),
    lead.email
      ? PlatformIdentity.findOne({
        where: sequelize.where(
          sequelize.fn('lower', sequelize.col('primary_email')), lead.email.trim().toLowerCase(),
        ),
        transaction: tx,
      })
      : Promise.resolve(null),
  ]);

  const project = engagement
    ? await DeliveryProject.findOne({
      where: { engagement_id: engagement.id }, order: [['created_at', 'ASC']], transaction: tx,
    })
    : null;

  const membership = project && identity
    ? await DeliveryProjectMember.findOne({
      where: {
        delivery_project_id: project.id,
        platform_identity_id: identity.id,
        delivery_role: DELIVERY_ROLES.CLIENT_REVIEWER,
      },
      transaction: tx,
    })
    : null;

  return {
    organization: organization ?? undefined,
    engagement: engagement ?? undefined,
    identity: identity ?? undefined,
    project: project ?? undefined,
    organizationId: organization?.id ?? null,
    engagementId: engagement?.id ?? null,
    identityId: identity?.id ?? null,
    projectId: project?.id ?? null,
    membershipId: membership?.id ?? null,
  };
}

async function writeChain(
  lead: Lead, plan: ConversionPlan, input: ConvertLeadInput,
  found: Awaited<ReturnType<typeof loadExisting>>, tx: Transaction,
): Promise<ConversionResult> {
  const organization = found.organization ?? await Organization.create({
    name: plan.organizationName,
    lead_id: lead.id,
    tenant_id: input.tenantId,
    brand_id: input.brandId ?? null,
    organization_type: 'client',
    // Null on purpose: a commercial client's owner never enrolled in anything. The column
    // being nullable is what makes an external company representable at all.
    owner_enrollment_id: null,
  }, { transaction: tx });

  const engagement = found.engagement ?? await DeliveryEngagement.create({
    tenant_id: input.tenantId,
    brand_id: input.brandId ?? null,
    organization_id: organization.id,
    engagement_type: plan.engagementType,
    name: plan.engagementName,
    status: 'active',
    source_lead_id: lead.id,
  }, { transaction: tx });

  const identity = found.identity ?? await PlatformIdentity.create({
    primary_email: plan.clientEmail,
    display_name: plan.clientDisplayName,
    status: 'active',
  }, { transaction: tx });

  if (!engagement.client_owner_identity_id) {
    await engagement.update({ client_owner_identity_id: identity.id }, { transaction: tx });
  }

  const project = found.project ?? await DeliveryProject.create({
    engagement_id: engagement.id,
    tenant_id: input.tenantId,
    brand_id: input.brandId ?? null,
    organization_id: organization.id,
    name: plan.projectName,
    slug: plan.projectSlug,
    project_class: plan.projectClass,
    status: plan.projectStatus,
    business_problem: plan.businessProblem,
  }, { transaction: tx });

  // findOrCreate rather than create: the unique index is on (project, identity, role)
  // regardless of status, so a revoked membership must be reinstated rather than
  // duplicated - and leaving it revoked would lock out a client just converted.
  const [membership, madeNew] = await DeliveryProjectMember.findOrCreate({
    where: {
      delivery_project_id: project.id,
      platform_identity_id: identity.id,
      delivery_role: DELIVERY_ROLES.CLIENT_REVIEWER,
    },
    defaults: {
      delivery_project_id: project.id,
      platform_identity_id: identity.id,
      delivery_role: DELIVERY_ROLES.CLIENT_REVIEWER,
      status: 'active',
      granted_by_identity_id: input.actorIdentityId ?? null,
    },
    transaction: tx,
  });
  if (!madeNew && membership.status !== 'active') {
    await membership.update({ status: 'active', revoked_at: null }, { transaction: tx });
  }

  return {
    refused: false,
    created: true,
    organizationId: organization.id,
    engagementId: engagement.id,
    identityId: identity.id,
    projectId: project.id,
    membershipId: membership.id,
  };
}

export async function convertLeadToClient(
  input: ConvertLeadInput,
): Promise<ConversionResult | ConversionRefusal> {
  const lead = await Lead.findByPk(input.leadId);
  const brandExists = input.brandId
    ? Boolean(await Brand.findOne({ where: { id: input.brandId } }))
    : null;

  const result = await sequelize.transaction(async (tx) => {
    const found = lead
      ? await loadExisting(lead, tx)
      : { organizationId: null, engagementId: null, identityId: null, projectId: null, membershipId: null };

    const plan = planConversion({
      lead: lead
        ? { id: lead.id, email: lead.email, company: lead.company, name: lead.name, message: lead.message }
        : null,
      brandExists,
      existing: found,
      engagementName: input.engagementName,
      projectName: input.projectName,
    });
    if (plan.refused) return plan;

    if (!plan.createsAnything) {
      return {
        refused: false as const,
        created: false,
        organizationId: found.organizationId!,
        engagementId: found.engagementId!,
        identityId: found.identityId!,
        projectId: found.projectId!,
        membershipId: found.membershipId!,
      };
    }

    return writeChain(lead!, plan, input, found as Awaited<ReturnType<typeof loadExisting>>, tx);
  });

  if (result.refused) return result;

  // Audited after the commit, so the trail never claims a conversion the database rolled
  // back. A failed audit write must not undo a good conversion either, hence the catch.
  try {
    await DeliveryEvent.create({
      delivery_project_id: result.projectId,
      engagement_id: result.engagementId,
      tenant_id: input.tenantId,
      event_type: result.created ? 'lead.converted' : 'lead.conversion_replayed',
      correlation_id: input.correlationId ?? null,
      actor_identity_id: input.actorIdentityId ?? null,
      outcome: 'success',
      context: { lead_id: input.leadId, organization_id: result.organizationId },
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'backend',
      event: 'lead_conversion_audit_failed',
      error_class: (error as Error).name,
      outcome: 'partial',
      context: { lead_id: input.leadId, engagement_id: result.engagementId },
    }));
  }

  return result;
}
