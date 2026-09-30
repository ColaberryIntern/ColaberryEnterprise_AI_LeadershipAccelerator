import { Op } from 'sequelize';
import {
  DeliveryEngagement,
  GrowthJourneyClassification,
  GrowthJourneyDecision,
  GrowthJourneyExecution,
  GrowthJourneyHandoff,
  GrowthJourneyOutcome,
  GrowthJourneyTransition,
  Lead,
  Visitor,
} from '../../models';
import type { SubjectSource } from './subjectResolver';
import { getAuthorizedLeadContexts } from '../../modules/tenancy/leadContextService';
import { matchesScope, personScopeWhere, type PersonJourneyArgs } from './personJourneyService';

/**
 * The drillthrough chain: can this person be followed end to end, and where does the trail break?
 * (Phase 6, T611)
 *
 * ─── WHAT IT ANSWERS, AND WHY "UNAVAILABLE" IS THE POINT ────────────────────
 *
 * Nine hops from a lead id, each `linked` or `unavailable` with a reason. The
 * value is not the links - it is the BREAKS. The measurement discovery (§5)
 * mapped every hop in this platform and found one hard break and several soft
 * ones, and a chain view that quietly omitted them would be worse than none: it
 * would read as "this person has no project" when the truth is "nothing joins a
 * project to a lead by key".
 *
 * So an absent link is never silence. It is `unavailable` with the reason, and
 * the reasons are this file's closed vocabulary rather than free text.
 *
 * ─── EVERY REF IS AN ID. NEVER AN ADDRESS ───────────────────────────────────
 *
 * One hop is JOINED on an address - lead → enrolment - and that is exactly the
 * hop most likely to leak one. The address is used as a key and never emitted:
 * `ref` carries the enrolment's UUID, and `via` carries HOW the link was made.
 * The route scrubs again on the way out, and a cell serialises the whole chain
 * under an adversarial fixture and refuses `@`.
 *
 * ─── THE PLAN SAID `via: 'email_equality'`. THERE ARE THREE PATHS, NOT ONE ──
 *
 * `subjectResolver` already walks lead → enrolment in three read-only steps,
 * stopping at the first hit, and it already names them: `explorer_profile` (the
 * bridge's own persisted link, a real foreign key), `enrollment_lead` (matches
 * `LOWER(enrollment_leads.email)`) and `enrollment_email` (matches
 * `LOWER(enrollments.email)`). Reporting all three as `email_equality` would
 * libel the first and hide which people are joined by a fragile key, so `via`
 * carries the resolver's own source.
 *
 * TWO of the three are address equalities, not one. `enrollment_lead` reads as
 * a keyed hop because it goes through a bridge table, but the bridge is joined
 * on the address too - so `weak_key` is set for BOTH, and only
 * `explorer_profile` is reported as keyed. They differ in degree, which the
 * `via` preserves: `enrollment_leads.email` is UNIQUE, so that match is at
 * least deterministic, while `enrollments.email` is neither unique nor indexed
 * and is the hard break the discovery names. Degree is not the same as safety,
 * and a reader filtering for fragile joins needs both rows.
 *
 * Reusing the resolver also keeps the rule that there is no second engine: this
 * file does not write a fourth email join, it asks the one that exists.
 *
 * ─── THE RESOLVER IS IMPORTED LAZILY, AND THAT IS LOAD-BEARING ──────────────
 *
 * `resolveSubject` is reached through `await import()` inside its hop, not at
 * module scope. `subjectResolver` pulls `explorerIdentityBridge → participantService
 * → emailService → settingsService → models/SystemSetting → config/database`,
 * and a router that imports this file at module scope inherits that whole tail:
 * seven suites mount `growthJourneyRoutes`, and the static import took FOUR of
 * them from green to "failed to run" by constructing a real Sequelize from a
 * stubbed env. A barrel mock cannot save them - `settingsService` imports
 * `models/SystemSetting` directly, under the mock. So the edge is cut here, at
 * the one file that owns it, rather than papered over with a mock in every
 * suite that happens to mount the router today.
 *
 * ─── THERE IS NO OPPORTUNITY TABLE, AND THIS SAYS SO ────────────────────────
 *
 * The discovery is explicit: the sales pipeline IS `leads.pipeline_stage` plus
 * its `activities` history. `delivery_opportunities` is a capability inside a
 * delivery project and `revenue_opportunities` is a reporting entity keyed on
 * `(entity_type, entity_id)` - neither is a sales opportunity. So this hop
 * reports the stage, normalised the way `outcomeNormalizer` already spells it
 * (`<lead_id>:<stage>`), and never implies a row that does not exist.
 */

export type ChainHopName =
  | 'campaign'
  | 'visitor'
  | 'lead'
  | 'journey'
  | 'handoff'
  | 'opportunity'
  | 'enrolment'
  | 'project'
  | 'outcomes';

/** Why a hop could not be followed. A closed vocabulary - never a free-text reason. */
export type ChainUnavailableReason =
  | 'no_key'
  | 'no_row'
  | 'not_in_scope'
  | 'unresolved';

export interface ChainHop {
  name: ChainHopName;
  status: 'linked' | 'unavailable';
  /** Present only when `unavailable`. */
  reason?: ChainUnavailableReason;
  /** An ID. Never an address, never a name. */
  ref?: string;
  /** How the link was made, when it is not a plain foreign key. */
  via?: string;
  /** True when the link rests on an address match rather than a key - see the header. */
  weak_key?: boolean;
  /** For the hops that are counts rather than a single row. */
  count?: number;
  /**
   * The handoff hop's second id: the ticket this handoff was escalated into.
   * A ticket is not reachable by foreign key (`tickets` is found by
   * `entity_type`/`entity_id`), so it travels as its own field rather than
   * displacing `ref`, which stays the handoff's own id on every row.
   */
  ticket_ref?: string;
}

export interface PersonChain {
  lead_id: number;
  hops: ChainHop[];
  as_of: string;
}

export type PersonChainResult = { status: 'not_found' } | { status: 'found'; chain: PersonChain };

const linked = (name: ChainHopName, ref?: string, extra: Partial<ChainHop> = {}): ChainHop => ({
  name,
  status: 'linked',
  ...(ref === undefined ? {} : { ref }),
  ...extra,
});

const unavailable = (name: ChainHopName, reason: ChainUnavailableReason, extra: Partial<ChainHop> = {}): ChainHop => ({
  name,
  status: 'unavailable',
  reason,
  ...extra,
});

/** `lead:<id>` - the subject_ref spelling every journey table uses for a lead anchor. */
const subjectRefOf = (leadId: number): string => `lead:${leadId}`;

async function campaignHop(leadId: number, where: Record<string, unknown>, visible: Record<string, unknown>[]): Promise<ChainHop> {
  // First touch, per brand, is the context row's own column - the only campaign link
  // on a lead that someone deliberately wrote. The rows were already read and scoped
  // for the visibility check, so this asks them rather than the database again.
  const first = visible.map((c) => c.first_campaign_id).find((v) => typeof v === 'string' && v.length > 0);
  if (first) return linked('campaign', String(first), { via: 'lead_tenant_contexts.first_campaign_id' });

  // Failing that, a journey execution names the campaign it enrolled into.
  const exec = await GrowthJourneyExecution.findOne({
    where: { ...where, lead_id: leadId, campaign_id: { [Op.ne]: null } },
    attributes: ['campaign_id'],
    order: [['created_at', 'DESC']],
  });
  const viaExec = exec ? (exec.get('campaign_id') as string | null) : null;
  if (viaExec) return linked('campaign', String(viaExec), { via: 'growth_journey_executions.campaign_id' });

  return unavailable('campaign', 'no_key');
}

async function visitorHop(leadId: number, lead: { visitor_id: string | null }): Promise<ChainHop> {
  if (lead.visitor_id) return linked('visitor', String(lead.visitor_id), { via: 'leads.visitor_id' });

  // The back-pointer. Either side may be set alone: the tracking service
  // backfills one direction and not always the other.
  const v = await Visitor.findOne({ where: { lead_id: leadId }, attributes: ['id'], order: [['created_at', 'ASC']] });
  if (v) return linked('visitor', String(v.get('id')), { via: 'visitors.lead_id' });

  return unavailable('visitor', 'no_key');
}

async function journeyHop(subjectRef: string, where: Record<string, unknown>): Promise<ChainHop> {
  const [classifications, decisions, transitions] = await Promise.all([
    GrowthJourneyClassification.count({ where: { ...where, subject_ref: subjectRef } }),
    GrowthJourneyDecision.count({ where: { ...where, subject_ref: subjectRef } }),
    GrowthJourneyTransition.count({ where: { ...where, subject_ref: subjectRef } }),
  ]);
  const total = classifications + decisions + transitions;
  if (total === 0) return unavailable('journey', 'no_row');
  return linked('journey', subjectRef, { via: 'subject_ref', count: total });
}

async function handoffHop(subjectRef: string, where: Record<string, unknown>): Promise<ChainHop> {
  const h = await GrowthJourneyHandoff.findOne({
    where: { ...where, subject_ref: subjectRef },
    attributes: ['id', 'ticket_id'],
    order: [['created_at', 'DESC']],
  });
  if (!h) return unavailable('handoff', 'no_row');
  const ticket = h.get('ticket_id') as string | null;
  // The ticket link has no foreign key: `tickets` is found by
  // (entity_type='growth_journey_handoff', entity_id=<handoff.id>). A null
  // ticket_id is a handoff nobody has ticketed, not a broken chain - so the
  // hop is `linked` either way, and the ticket id is CARRIED rather than just
  // consulted for a `via`. Reading it only to pick a label would answer "is
  // there a ticket" while withholding which one, and the question this view
  // exists to answer is where the trail goes next.
  return linked(
    'handoff',
    String(h.get('id')),
    ticket ? { via: 'handoffs.ticket_id', ticket_ref: String(ticket) } : { via: 'no_ticket' },
  );
}

function opportunityHop(leadId: number, stage: string | null): ChainHop {
  if (!stage) return unavailable('opportunity', 'no_row');
  // Normalised the way outcomeNormalizer already spells it, so the ref means the
  // same thing here as it does in the outcomes table.
  return linked('opportunity', `${leadId}:${stage}`, { via: 'leads.pipeline_stage' });
}

/** The hop joined on an address. The address is a key here and never an output. */
async function enrolmentHop(leadId: number): Promise<ChainHop> {
  // Lazy on purpose - see the header. This import is why seven router suites
  // do not need a mock for this file.
  const { resolveSubject } = await import('./subjectResolver');
  const resolved = await resolveSubject({ leadId });
  if (resolved.status !== 'resolved') return unavailable('enrolment', 'unresolved');

  // Not cast: `SubjectView.enrollment_id` is typed `string | null`, so a rename
  // there is a compile error here rather than a silently absent hop.
  const enrollmentId = resolved.subject.enrollment_id;
  if (!enrollmentId) return unavailable('enrolment', 'no_key');

  // Which of the three walks found it. Only `explorer_profile` is a real key;
  // the other two both match on an address, so both are weak - see the header.
  const order: SubjectSource[] = ['explorer_profile', 'enrollment_lead', 'enrollment_email'];
  const via = order.find((s) => resolved.sources.includes(s)) ?? 'enrollment';
  return linked('enrolment', String(enrollmentId), { via, weak_key: via !== 'explorer_profile' });
}

async function projectHop(leadId: number, scoped: Record<string, unknown>): Promise<ChainHop> {
  // `source_lead_id` is a bare INTEGER with no index and no foreign key - the
  // discovery names it a soft break. It is still the only lead → project link.
  //
  // SCOPED, unlike every other delivery table. `delivery_engagements` carries
  // its own `tenant_id` (NOT NULL) and `brand_id`, so the caller's clause
  // applies directly - and it must: `source_lead_id` is written by whoever
  // converted the lead, with nothing stopping an engagement in one brand from
  // pointing at a lead another operator can see. Without the clause a
  // Training-only operator asking about a lead they legitimately hold would be
  // handed an Enterprise engagement's UUID. The lead being in scope does not
  // make everything hanging off it in scope.
  const e = await DeliveryEngagement.findOne({
    where: { ...scoped, source_lead_id: leadId },
    attributes: ['id'],
    order: [['created_at', 'DESC']],
  });
  if (!e) return unavailable('project', 'no_key');
  return linked('project', String(e.get('id')), { via: 'delivery_engagements.source_lead_id' });
}

async function outcomesHop(subjectRef: string, where: Record<string, unknown>): Promise<ChainHop> {
  const n = await GrowthJourneyOutcome.count({ where: { ...where, subject_ref: subjectRef } });
  if (n === 0) return unavailable('outcomes', 'no_row');
  return linked('outcomes', subjectRef, { via: 'subject_ref', count: n });
}

/**
 * The chain for one lead, under the caller's scope.
 *
 * Scoped exactly like Person 360 - `personScopeWhere` builds the clause and
 * `matchesScope` re-checks the lead row against it, so a lead outside the
 * caller's brands is `not_found` and answers with the same 404 body as a lead
 * that does not exist. A foreign tenant must not be able to tell those apart.
 */
export async function buildPersonChain(
  // `limit` is deliberately NOT accepted. Every hop is one row or one count, so
  // there is no collection to page, and taking the sibling's `limit` whole would
  // have advertised a knob that changes nothing.
  args: Omit<PersonJourneyArgs, 'limit'> & { now?: Date },
): Promise<PersonChainResult> {
  const { ctx, leadId } = args;
  const where = personScopeWhere(ctx, leadId);

  const lead = await Lead.findByPk(leadId, { attributes: ['id', 'visitor_id', 'pipeline_stage'] });
  if (!lead) return { status: 'not_found' };

  // Scope lives in `lead_tenant_contexts`, NOT on the lead: a lead row carries no
  // tenant or brand of its own, so checking it would have been checking nothing.
  // Person 360 reads the authorized contexts and narrows them with the SAME clause
  // its queries carry; this does exactly that, and a lead with no context row the
  // caller may see is `not_found` - byte-identical to a lead that does not exist.
  const contexts = await getAuthorizedLeadContexts(leadId, ctx.authorizedTenantIds, ctx.isPlatformSuperAdmin);
  const visible = contexts
    .map((c) => c as unknown as Record<string, unknown>)
    .filter((c) => matchesScope(c, where));
  if (visible.length === 0) return { status: 'not_found' };

  const subjectRef = subjectRefOf(leadId);
  const scoped = { ...where };
  delete (scoped as { lead_id?: unknown }).lead_id;

  const [campaign, visitor, journey, handoff, enrolment, project, outcomes] = await Promise.all([
    campaignHop(leadId, scoped, visible),
    visitorHop(leadId, { visitor_id: (lead.get('visitor_id') as string | null) ?? null }),
    journeyHop(subjectRef, scoped),
    handoffHop(subjectRef, scoped),
    enrolmentHop(leadId),
    projectHop(leadId, scoped),
    outcomesHop(subjectRef, scoped),
  ]);

  return {
    status: 'found',
    chain: {
      lead_id: leadId,
      hops: [
        campaign,
        visitor,
        // The lead itself is the anchor: if we got here it is in scope and real.
        linked('lead', String(leadId)),
        journey,
        handoff,
        opportunityHop(leadId, (lead.get('pipeline_stage') as string | null) ?? null),
        enrolment,
        project,
        outcomes,
      ],
      as_of: (args.now ?? new Date()).toISOString(),
    },
  };
}
