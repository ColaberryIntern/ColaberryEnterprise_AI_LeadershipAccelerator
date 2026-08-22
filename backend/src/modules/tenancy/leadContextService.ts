import { LeadTenantContext } from '../../models';

/**
 * LeadContextService — create and maintain one person's relationship with one brand.
 *
 * This is the service master plan §7 calls `LeadContextService`, and it is the only
 * place `lead_tenant_contexts` rows are written. Centralising it is what makes the
 * first-touch rule enforceable: attribution history is destroyed by a single careless
 * `update()` elsewhere, and that damage is not recoverable from logs.
 *
 * THE RULES, in order of importance:
 *
 *  1. First-touch fields are WRITE-ONCE. Once set, no later visit overwrites them.
 *     A field that is still null may be filled — that is completion, not overwriting.
 *  2. Last-touch fields are freely updated.
 *  3. The canonical Lead is never duplicated. A person appearing on a second brand gets
 *     a second context row, not a second lead.
 *  4. Consent is per brand. Creating a CPN context never grants AI Flotation permission.
 *  5. Idempotent: the same call twice produces the same state and no second row. The
 *     unique index on (lead_id, tenant_id, brand_id) is the backstop.
 */

export interface TouchAttribution {
  sourceId?: string | null;
  entryPointId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  campaignId?: string | null;
  campaignLeadId?: string | null;
  occurredAt?: Date;
}

export interface EnsureLeadContextInput {
  leadId: number;
  tenantId: string;
  brandId: string;
  relationshipType: string;
  organizationId?: string | null;
  pipelineStage?: string | null;
  leadTemperature?: string | null;
  consentContact?: boolean;
  consentSource?: string | null;
  attribution?: TouchAttribution;
}

export interface EnsureLeadContextResult {
  context: LeadTenantContext;
  created: boolean;
  /** True when an existing row was modified. False means the call was a genuine no-op. */
  updated: boolean;
}

/** Fields that may only ever be written once. Named explicitly so the rule is greppable. */
const FIRST_TOUCH_FIELDS = [
  'first_source_id',
  'first_entry_point_id',
  'first_visitor_id',
  'first_session_id',
  'first_campaign_id',
  'first_campaign_lead_id',
  'first_touch_at',
] as const;

/**
 * Build the first-touch patch: only fields that are currently null are filled.
 * A context created before its campaign was known can still learn its campaign later,
 * but a context that already knows its first source keeps it forever.
 */
function firstTouchPatch(
  existing: LeadTenantContext,
  attribution: TouchAttribution,
  occurredAt: Date,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const candidates: Record<(typeof FIRST_TOUCH_FIELDS)[number], unknown> = {
    first_source_id: attribution.sourceId ?? null,
    first_entry_point_id: attribution.entryPointId ?? null,
    first_visitor_id: attribution.visitorId ?? null,
    first_session_id: attribution.sessionId ?? null,
    first_campaign_id: attribution.campaignId ?? null,
    first_campaign_lead_id: attribution.campaignLeadId ?? null,
    first_touch_at: occurredAt,
  };

  for (const field of FIRST_TOUCH_FIELDS) {
    const current = (existing as any)[field];
    const candidate = candidates[field];
    if (current === null || current === undefined) {
      if (candidate !== null && candidate !== undefined) patch[field] = candidate;
    }
  }
  return patch;
}

function lastTouchPatch(attribution: TouchAttribution, occurredAt: Date): Record<string, unknown> {
  const patch: Record<string, unknown> = { last_touch_at: occurredAt };
  if (attribution.sourceId) patch.last_source_id = attribution.sourceId;
  if (attribution.entryPointId) patch.last_entry_point_id = attribution.entryPointId;
  if (attribution.sessionId) patch.last_session_id = attribution.sessionId;
  if (attribution.campaignId) patch.last_campaign_id = attribution.campaignId;
  return patch;
}

/**
 * Create the brand relationship if it does not exist, otherwise update its last touch.
 *
 * Covers all three cases from master plan §72:
 *   - lead exists, brand context does not  → create context, preserve other contexts
 *   - lead + brand context both exist      → reuse both, update last touch only
 *   - neither                               → the caller creates the Lead first; this
 *                                             service never creates leads, because lead
 *                                             dedup rules live in leadService and having
 *                                             two places that create leads is how
 *                                             duplicates appear.
 */
export async function ensureLeadTenantContext(
  input: EnsureLeadContextInput,
): Promise<EnsureLeadContextResult> {
  const attribution = input.attribution ?? {};
  const occurredAt = attribution.occurredAt ?? new Date();

  const existing = await LeadTenantContext.findOne({
    where: { lead_id: input.leadId, tenant_id: input.tenantId, brand_id: input.brandId },
  });

  if (!existing) {
    const context = await LeadTenantContext.create({
      lead_id: input.leadId,
      tenant_id: input.tenantId,
      brand_id: input.brandId,
      organization_id: input.organizationId ?? null,
      relationship_type: input.relationshipType,
      status: 'active',
      pipeline_stage: input.pipelineStage ?? null,
      lead_temperature: input.leadTemperature ?? null,
      // Consent defaults to false and is only true when this specific brand's form said
      // so. Inheriting consent from another brand relationship would be a CAN-SPAM
      // problem wearing a data-model costume.
      consent_contact: input.consentContact ?? false,
      consent_source: input.consentSource ?? null,
      consent_at: input.consentContact ? occurredAt : null,
      first_source_id: attribution.sourceId ?? null,
      first_entry_point_id: attribution.entryPointId ?? null,
      first_visitor_id: attribution.visitorId ?? null,
      first_session_id: attribution.sessionId ?? null,
      first_campaign_id: attribution.campaignId ?? null,
      first_campaign_lead_id: attribution.campaignLeadId ?? null,
      first_touch_at: occurredAt,
      last_source_id: attribution.sourceId ?? null,
      last_entry_point_id: attribution.entryPointId ?? null,
      last_session_id: attribution.sessionId ?? null,
      last_campaign_id: attribution.campaignId ?? null,
      last_touch_at: occurredAt,
    } as any);
    return { context, created: true, updated: false };
  }

  const rawPatch: Record<string, unknown> = {
    ...firstTouchPatch(existing, attribution, occurredAt),
    ...lastTouchPatch(attribution, occurredAt),
  };

  // Drop keys whose value already matches. A replayed request re-sends the same last
  // source and last session, and counting those as changes would make every retry look
  // like a state transition — which defeats the point of reporting idempotency at all.
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawPatch)) {
    if (key === 'last_touch_at') {
      patch[key] = value;
      continue;
    }
    if ((existing as any)[key] !== value) patch[key] = value;
  }

  // Consent can be granted by a later submission but is never silently revoked here.
  // Withdrawal is an explicit action through the preference service, not a side effect
  // of a form that happened to omit the checkbox.
  if (input.consentContact && !existing.consent_contact) {
    patch.consent_contact = true;
    patch.consent_source = input.consentSource ?? null;
    patch.consent_at = occurredAt;
  }

  if (input.pipelineStage && input.pipelineStage !== existing.pipeline_stage) {
    patch.pipeline_stage = input.pipelineStage;
  }
  if (input.leadTemperature && input.leadTemperature !== existing.lead_temperature) {
    patch.lead_temperature = input.leadTemperature;
  }
  if (input.organizationId && !existing.organization_id) {
    patch.organization_id = input.organizationId;
  }

  // last_touch_at alone is not a meaningful change for idempotency reporting: a replayed
  // request should read as "already correct", not as an update.
  const meaningfulKeys = Object.keys(patch).filter((k) => k !== 'last_touch_at');
  await existing.update(patch as any);


  return { context: existing, created: false, updated: meaningfulKeys.length > 0 };
}

/** Every brand relationship for a lead. Callers MUST filter by authorized tenants. */
export async function getLeadContexts(leadId: number): Promise<LeadTenantContext[]> {
  return LeadTenantContext.findAll({
    where: { lead_id: leadId },
    order: [['first_touch_at', 'ASC']],
  });
}

/**
 * The contexts a given operator may see.
 *
 * Separate from `getLeadContexts` on purpose. A CPN admin opening a lead must not learn
 * that the person also has an AI Flotation relationship — the existence of the
 * relationship is itself confidential. Any route returning contexts uses this one.
 */
export async function getAuthorizedLeadContexts(
  leadId: number,
  authorizedTenantIds: string[],
  isPlatformSuperAdmin: boolean,
): Promise<LeadTenantContext[]> {
  const all = await getLeadContexts(leadId);
  if (isPlatformSuperAdmin) return all;
  if (authorizedTenantIds.length === 0) return [];
  return all.filter((c) => authorizedTenantIds.includes(c.tenant_id));
}

/** Does this lead already have a relationship with this brand? */
export async function hasBrandRelationship(
  leadId: number,
  tenantId: string,
  brandId: string,
): Promise<boolean> {
  const found = await LeadTenantContext.findOne({
    where: { lead_id: leadId, tenant_id: tenantId, brand_id: brandId },
    attributes: ['id'],
  });
  return Boolean(found);
}
