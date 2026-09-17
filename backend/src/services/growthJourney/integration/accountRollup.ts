import { Organization } from '../../../models';
import { ensureLeadTenantContext } from '../../../modules/tenancy/leadContextService';
import { isKillSwitchActive } from '../../launchSafety';

/**
 * The account roll-up: a `qualified` Business handoff becomes an account
 * (Phase 4 T406).
 *
 * ─── THE ONE FILE ALLOWED TO NAME THESE TWO WRITERS ─────────────────────────
 *
 * `noSendPaths.test.ts` bans the literals `Organization.create` and
 * `ensureLeadTenantContext` in every file under `services/growthJourney` and
 * `services/routing`, because creating an account or widening a brand
 * relationship from an AI decision is exactly what the contract forbids. This
 * file is the ONE allowlisted exception, for exactly those two literals, and
 * it is reachable ONLY from a human's disposition (`integrationIsolation.test.ts`
 * proves the nightly path never imports `integration/`). Nothing here decides;
 * a human did, on the row this is called for.
 *
 * ─── IDEMPOTENT ON WHAT ALREADY EXISTS ──────────────────────────────────────
 *
 * `organizations.lead_id` already means "this account came from that lead"
 * (the conversion module anchors on it too): the roll-up FINDS before it
 * creates, and the brand relationship goes through `ensureLeadTenantContext`,
 * which creates the context only when the lead has none for this brand and
 * sets `organization_id` only when it is null. The same disposition twice is
 * one organisation and one context patch.
 *
 * The kill switch is checked first and refuses by name; the disposition that
 * asked still records, with the refusal on its row.
 */

export const ROLLUP_ORGANIZATION_TYPE = 'client';
/** The relationship a human's `qualified` establishes when the lead had none for the brand yet. */
export const ROLLUP_RELATIONSHIP_TYPE = 'client';
export const UNNAMED_ORGANIZATION = '<unnamed>';

export interface AccountRollupInput {
  lead: { id: number; company: string | null };
  tenantId: string;
  brandId: string;
}

export type AccountRollupResult =
  | { status: 'refused'; reason: 'kill_switch_active' }
  | {
      status: 'written';
      organization_id: string;
      organization_created: boolean;
      context_id: string;
      context_created: boolean;
      context_updated: boolean;
    };

export async function rollUpAccount(input: AccountRollupInput): Promise<AccountRollupResult> {
  if (await isKillSwitchActive()) return { status: 'refused', reason: 'kill_switch_active' };

  const existing = await Organization.findOne({ where: { lead_id: input.lead.id } });
  const organization = existing ?? (await Organization.create({
    lead_id: input.lead.id,
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    name: input.lead.company?.trim() || UNNAMED_ORGANIZATION,
    organization_type: ROLLUP_ORGANIZATION_TYPE,
    owner_enrollment_id: null,
  }));

  const context = await ensureLeadTenantContext({
    leadId: input.lead.id,
    tenantId: input.tenantId,
    brandId: input.brandId,
    relationshipType: ROLLUP_RELATIONSHIP_TYPE,
    organizationId: organization.id,
  });

  return {
    status: 'written',
    organization_id: organization.id,
    organization_created: existing === null,
    context_id: context.context.id,
    context_created: context.created,
    context_updated: context.updated,
  };
}
