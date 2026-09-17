import { GrowthJourneyClassification, GrowthJourneyConversationOwnership, GrowthJourneyDecision, GrowthJourneyHandoff, GrowthJourneyOutcome, GrowthJourneyTransition, Lead } from '../../models';
import { getAuthorizedLeadContexts } from '../../modules/tenancy/leadContextService';
import { tenantScopeWhere, type PlatformRequestContext } from '../../modules/tenancy/tenantAuthorization';

/**
 * Person 360 (Phase 4 T410): one lead's journey across every brand the CALLER
 * may see, from stored rows only.
 *
 * ─── THE CONFIDENTIALITY RULE, APPLIED TO EVERY COLLECTION ──────────────────
 *
 * A lead with a CPN relationship and an Enterprise relationship shows ONE of
 * them to a Training-only operator - the existence of the other relationship
 * is itself confidential (`leadContextService.ts`, `getAuthorizedLeadContexts`).
 * The relationships come from that reader and are then narrowed to the
 * caller's brands; every other collection is read under `tenantScopeWhere(ctx)`
 * plus the requested brand, the same clause the list routes use. A lead the
 * caller can see nothing of is `not_found`, byte-identical to a lead that does
 * not exist, so the route can never confirm a person to an outsider.
 *
 * ─── SUMMARIES, NEVER BLOBS; IDS, NEVER AN ADDRESS ──────────────────────────
 *
 * A decision here is what was chosen and why - never its candidate list, its
 * scores or its contact evidence (the `/decisions/:id/why` route is for that);
 * a handoff is its status, queue, SLA and disposition - never its evidence
 * packet; a classification is its path and status - never its evidence trace,
 * which can carry a human's free-text override reason. No email column is
 * read anywhere in this file, and the controller scrubs the view once more at
 * the boundary.
 *
 * Read-only, and stored rows only: this file imports the models, the two
 * tenancy helpers, and nothing of the pipeline - the T312 discipline, pinned
 * by the source test.
 */

export const PERSON_CLASSIFICATION_ATTRIBUTES = [
  'id', 'tenant_id', 'brand_id', 'subject_ref', 'enrollment_id', 'trigger', 'journey_program_slug', 'primary_path', 'secondary_paths', 'intent', 'confidence',
  'source_step', 'requires_human_review', 'status', 'locked', 'referral_target_brand_id', 'ai_involved', 'override_of', 'decided_by', 'created_at',
] as const;

export const PERSON_DECISION_ATTRIBUTES = [
  'id', 'tenant_id', 'brand_id', 'program_id', 'subject_ref', 'enrollment_id', 'classification_id', 'trigger', 'decision_date', 'mode', 'selected_action', 'selected_path', 'selected_channel',
  'state_at_decision', 'overlays_at_decision', 'reason', 'requires_human_review', 'ai_involved', 'executed', 'decided_by', 'created_at',
] as const;

export const PERSON_TRANSITION_ATTRIBUTES = [
  'id', 'tenant_id', 'brand_id', 'program_id', 'subject_ref', 'enrollment_id', 'transition_type', 'from_value', 'to_value', 'status', 'reason', 'requested_by', 'created_at',
] as const;

export const PERSON_HANDOFF_ATTRIBUTES = [
  'id', 'tenant_id', 'brand_id', 'program_id', 'subject_ref', 'enrollment_id', 'decision_id', 'owner_queue', 'assigned_to_type', 'assigned_to_id', 'ticket_id', 'assignment_blocked_reason',
  'priority', 'urgent', 'reason', 'sla_due_at', 'status', 'disposition', 'disposition_reason', 'disposition_at', 'dispositioned_by', 'return_to_ai', 'integration_refused',
  'accepted_at', 'expired_at', 'source', 'created_at',
] as const;

export const PERSON_OUTCOME_ATTRIBUTES = [
  'id', 'tenant_id', 'brand_id', 'subject_ref', 'handoff_id', 'decision_id', 'outcome_type', 'source', 'source_ref', 'occurred_at', 'value', 'metadata', 'created_at',
] as const;

export const PERSON_CONVERSATION_ATTRIBUTES = ['id', 'tenant_id', 'brand_id', 'owner_type', 'owner_id', 'channel', 'source', 'since_at'] as const;

/** The relationship columns a 360 shows: the brand, the kind, the stage, the consent - never the context's free metadata. */
export const PERSON_RELATIONSHIP_ATTRIBUTES = [
  'id', 'tenant_id', 'brand_id', 'organization_id', 'relationship_type', 'status', 'pipeline_stage', 'lead_temperature', 'consent_contact', 'consent_source', 'consent_at',
  'first_touch_at', 'last_touch_at', 'assigned_platform_identity_id',
] as const;

type Columns<K extends readonly string[]> = Record<K[number], unknown>;

export interface PersonJourney {
  subject: { lead_id: number; subject_ref: string; enrollment_ids: string[] };
  scope: { tenant_id: string | null; brand_id: string | null; brand_restricted: boolean };
  relationships: Columns<typeof PERSON_RELATIONSHIP_ATTRIBUTES>[];
  classifications: Columns<typeof PERSON_CLASSIFICATION_ATTRIBUTES>[];
  decisions: Columns<typeof PERSON_DECISION_ATTRIBUTES>[];
  transitions: Columns<typeof PERSON_TRANSITION_ATTRIBUTES>[];
  handoffs: Columns<typeof PERSON_HANDOFF_ATTRIBUTES>[];
  outcomes: Columns<typeof PERSON_OUTCOME_ATTRIBUTES>[];
  conversation: Columns<typeof PERSON_CONVERSATION_ATTRIBUTES> | null;
  limit: number;
}

export type PersonJourneyResult = { status: 'not_found' } | { status: 'found'; person: PersonJourney };

export interface PersonJourneyArgs {
  leadId: number;
  ctx: PlatformRequestContext;
  /** Rows per collection, newest first. */
  limit: number;
}

/** Column by column, so a plain object and a model instance shape the same and nothing outside the list leaks. */
function pick<K extends readonly string[]>(row: Record<string, unknown>, keys: K): Columns<K> {
  const out = {} as Columns<K>;
  for (const k of keys) out[k as K[number]] = row[k];
  return out;
}

/** The brands the caller may see a row of: the requested one, else the memberships' confinement, else all. */
function inBrandScope(ctx: PlatformRequestContext, brandId: string): boolean {
  if (ctx.isPlatformSuperAdmin) return true;
  if (ctx.brandId) return brandId === ctx.brandId;
  return ctx.authorizedBrandIds === null || ctx.authorizedBrandIds.includes(brandId);
}

/** The list routes' clause plus the lead: tenant(s), the brand confinement, the requested brand. */
export function personScopeWhere(ctx: PlatformRequestContext, leadId: number): Record<string, unknown> {
  return { lead_id: leadId, ...tenantScopeWhere(ctx), ...(ctx.brandId ? { brand_id: ctx.brandId } : {}) };
}

export async function loadPersonJourney(args: PersonJourneyArgs): Promise<PersonJourneyResult> {
  const { leadId, ctx, limit } = args;
  const lead = await Lead.findByPk(leadId, { attributes: ['id'] });
  if (!lead) return { status: 'not_found' };

  const where = personScopeWhere(ctx, leadId);
  const [contexts, classifications, decisions, transitions, handoffs, outcomes, conversation] = await Promise.all([
    getAuthorizedLeadContexts(leadId, ctx.authorizedTenantIds, ctx.isPlatformSuperAdmin),
    GrowthJourneyClassification.findAll({ where, attributes: [...PERSON_CLASSIFICATION_ATTRIBUTES], order: [['created_at', 'DESC']], limit }),
    GrowthJourneyDecision.findAll({ where, attributes: [...PERSON_DECISION_ATTRIBUTES], order: [['decision_date', 'DESC'], ['created_at', 'DESC']], limit }),
    GrowthJourneyTransition.findAll({ where, attributes: [...PERSON_TRANSITION_ATTRIBUTES], order: [['created_at', 'DESC']], limit }),
    GrowthJourneyHandoff.findAll({ where, attributes: [...PERSON_HANDOFF_ATTRIBUTES], order: [['created_at', 'DESC']], limit }),
    GrowthJourneyOutcome.findAll({ where, attributes: [...PERSON_OUTCOME_ATTRIBUTES], order: [['occurred_at', 'DESC']], limit }),
    GrowthJourneyConversationOwnership.findOne({ where: { ...where, cleared_at: null }, attributes: [...PERSON_CONVERSATION_ATTRIBUTES], order: [['since_at', 'DESC']] }),
  ]);

  // The relationships reader filters by tenant; the brand confinement is applied here, the same way the list clause does.
  const relationships = contexts.filter((c) => inBrandScope(ctx, c.brand_id)).map((c) => pick(c as unknown as Record<string, unknown>, PERSON_RELATIONSHIP_ATTRIBUTES));

  const nothingVisible = relationships.length === 0 && classifications.length === 0 && decisions.length === 0 && transitions.length === 0 && handoffs.length === 0 && outcomes.length === 0 && !conversation;
  if (nothingVisible) return { status: 'not_found' };

  const enrollment_ids = [...new Set([...classifications, ...handoffs].map((r) => r.enrollment_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const person: PersonJourney = {
    subject: { lead_id: leadId, subject_ref: `lead:${leadId}`, enrollment_ids },
    scope: { tenant_id: ctx.tenantId, brand_id: ctx.brandId, brand_restricted: ctx.authorizedBrandIds !== null },
    relationships,
    classifications: classifications.map((r) => pick(r as unknown as Record<string, unknown>, PERSON_CLASSIFICATION_ATTRIBUTES)),
    decisions: decisions.map((r) => pick(r as unknown as Record<string, unknown>, PERSON_DECISION_ATTRIBUTES)),
    transitions: transitions.map((r) => pick(r as unknown as Record<string, unknown>, PERSON_TRANSITION_ATTRIBUTES)),
    handoffs: handoffs.map((r) => pick(r as unknown as Record<string, unknown>, PERSON_HANDOFF_ATTRIBUTES)),
    outcomes: outcomes.map((r) => pick(r as unknown as Record<string, unknown>, PERSON_OUTCOME_ATTRIBUTES)),
    conversation: conversation ? pick(conversation as unknown as Record<string, unknown>, PERSON_CONVERSATION_ATTRIBUTES) : null,
    limit,
  };
  return { status: 'found', person };
}
