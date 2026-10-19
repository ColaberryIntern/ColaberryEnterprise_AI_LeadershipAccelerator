import { env } from '../../config/env';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { OPEN_HANDOFF_STATUSES } from '../../models/GrowthJourneyHandoff';
import { classifyError } from '../../utils/errorClassifier';
import type { EXPLORER_PROGRAM as ExplorerProgramConst } from '../growthJourney/explorerProgramBridge';
import type { AssignResult, CreateHandoffArgs, CreateHandoffResult } from '../growthJourney/handoffs/handoffService';

/**
 * The Explorer tour's opt-in (Colaberry Campus C7): "Have admissions reach out to me" writes ONE Growth Journey handoff.
 *
 * Ali's decision (19 Oct 2026): the click is the consent; nothing is written without it. It is recorded on the row as the trigger
 * reason `campus_tour_opt_in` (the Growth tab's Reason). With no decision behind it, the packet's consent section reads no_decision
 * and consent_basis stays null, exactly like every reply-route handoff.
 *
 * Same writer and shape as replyHandoffHook (the model caller): capability check FIRST (GROWTH_JOURNEY_ENABLED and
 * GROWTH_JOURNEY_HANDOFFS_ENABLED, through the flags module only), Explorer brand + program from EXPLORER_PROGRAM, heavy modules
 * required lazily, never throws.
 *
 * THE ANSWER IS WHAT THE WRITER RETURNED, nothing else (the client shows success copy only for handoff:true):
 *   created       new row, open                      -> handoff true
 *   already_open  replayed onto an open row          -> handoff true (may be another queue's row for the same lead or subject)
 *   closed        replayed onto a closed row         -> handoff false
 *   disabled      capability off, nothing queried    -> handoff false
 *   unavailable   brand absent or the writer threw   -> handoff false; NOTHING was written
 * assignHandoff runs after a successful create in its own try/catch: a throw there is logged and the answer stays true (the row
 * exists, queued). When the flags are on and a queue_assignee policy exists, assignment may create a tickets row, and open
 * handoffs appear in the assignee's daily digest email.
 *
 * IDEMPOTENCY: event_ref = campus_tour_opt_in:<enrollment>:<Central date>. A second click the same day replays the same key; while
 * any handoff for this subject (or its lead) is open the writer's open-row indexes return it; after admissions closes it, the
 * learner can opt in again on a later day instead of a constant key swallowing it forever (handoffService.ts warning).
 * No email ever goes into refs (the packet refuses addresses).
 */

export type TourHandoffReason = 'created' | 'already_open' | 'closed' | 'disabled' | 'unavailable';
export interface TourHandoffResult { handoff: boolean; reason: TourHandoffReason }

export const TOUR_HANDOFF_REASON = 'campus_tour_opt_in';

export interface TourHandoffDeps {
  EXPLORER_PROGRAM: typeof ExplorerProgramConst;
  resolveBrandBySlug: (tenantSlug: string, brandSlug: string) => Promise<{ id: string; tenant_id: string; slug: string } | null>;
  findProgram: (brandId: string, slug: string) => Promise<{ id: string; slug: string; kind: 'learner' | 'business' | 'consulting' } | null>;
  resolveLeadId: (enrollmentId: string) => Promise<number | null>;
  createHandoff: (a: CreateHandoffArgs) => Promise<CreateHandoffResult>;
  assignHandoff: (row: CreateHandoffResult['row'], flags: GrowthJourneyFlags, asOf: Date) => Promise<AssignResult>;
}

function defaultDeps(): TourHandoffDeps {
  const { EXPLORER_PROGRAM } = require('../growthJourney/explorerProgramBridge') as Pick<TourHandoffDeps, 'EXPLORER_PROGRAM'>;
  const { resolveBrandBySlug } = require('../../modules/tenancy/tenantResolver') as Pick<TourHandoffDeps, 'resolveBrandBySlug'>;
  const { JourneyProgram } = require('../../models') as { JourneyProgram: { findOne: (q: { where: { brand_id: string; slug: string } }) => ReturnType<TourHandoffDeps['findProgram']> } };
  const { resolveExplorerLead } = require('../explorerGrowth/explorerIdentityBridge') as { resolveExplorerLead: (id: string, o: { dryRun: boolean }) => Promise<{ lead_id: number | null }> };
  const { createHandoff, assignHandoff } = require('../growthJourney/handoffs/handoffService') as Pick<TourHandoffDeps, 'createHandoff' | 'assignHandoff'>;
  return {
    EXPLORER_PROGRAM, resolveBrandBySlug, createHandoff, assignHandoff,
    findProgram: (brandId, slug) => JourneyProgram.findOne({ where: { brand_id: brandId, slug } }),
    // dryRun: read-only, never writes explorer_journey_profiles. Only the lead id is used; the email it computes is never passed on.
    resolveLeadId: async (id) => (await resolveExplorerLead(id, { dryRun: true })).lead_id,
  };
}

/** YYYY-MM-DD in America/Chicago (the day the opt-in counts for). */
export function centralDate(asOf: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(asOf);
}

const isOpen = (status: string): boolean => (OPEN_HANDOFF_STATUSES as readonly string[]).includes(status);

function logFailure(event: string, enrollmentId: string, err: unknown): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: classifyError(err), context: { enrollment_id: enrollmentId } }));
}

export async function requestTourHandoff(
  enrollmentId: string, flags: GrowthJourneyFlags = env.growthJourney, asOf: Date = new Date(), deps?: TourHandoffDeps,
): Promise<TourHandoffResult> {
  if (!isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags)) return { handoff: false, reason: 'disabled' };
  let created: CreateHandoffResult;
  let d: TourHandoffDeps;
  try {
    d = deps ?? defaultDeps(); // inside the try: a module that fails to load is "unavailable", never a rejected promise
    const brand = await d.resolveBrandBySlug(d.EXPLORER_PROGRAM.tenantSlug, d.EXPLORER_PROGRAM.brandSlug);
    if (!brand) return { handoff: false, reason: 'unavailable' };
    const [program, leadId] = await Promise.all([d.findProgram(brand.id, d.EXPLORER_PROGRAM.programSlug), d.resolveLeadId(enrollmentId)]);
    created = await d.createHandoff({
      refs: {
        tenant_id: brand.tenant_id, brand_id: brand.id, brand_slug: brand.slug,
        program: program ? { id: program.id, slug: program.slug, kind: program.kind } : null,
        subject_ref: `enrollment:${enrollmentId}`, lead_id: leadId, enrollment_id: enrollmentId, path: null,
      },
      trigger: { source: 'manual', owner_queue: 'admissions', reason: TOUR_HANDOFF_REASON, urgent_hint: false,
        event_ref: `${TOUR_HANDOFF_REASON}:${enrollmentId}:${centralDate(asOf)}` },
      decision: null,
      asOf,
    });
  } catch (err: unknown) {
    logFailure('campus_tour_handoff_failed', enrollmentId, err);
    return { handoff: false, reason: 'unavailable' };
  }
  const { row, replayed } = created;
  if (!isOpen(row.status)) return { handoff: false, reason: 'closed' };
  if (!replayed) {
    try {
      await d.assignHandoff(row, flags, asOf);
    } catch (err: unknown) {
      logFailure('campus_tour_handoff_assign_failed', enrollmentId, err); // the row exists and stays queued
    }
  }
  return { handoff: true, reason: replayed ? 'already_open' : 'created' };
}
