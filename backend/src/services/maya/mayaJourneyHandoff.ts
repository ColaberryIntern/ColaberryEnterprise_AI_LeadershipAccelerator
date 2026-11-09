import { env } from '../../config/env';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { OPEN_HANDOFF_STATUSES } from '../../models/GrowthJourneyHandoff';
import { classifyError } from '../../utils/errorClassifier';
import { subjectRefFrom } from '../identity/identifierPrecedence';
import type { EXPLORER_PROGRAM as ExplorerProgramConst } from '../growthJourney/explorerProgramBridge';
import type { AssignResult, CreateHandoffArgs, CreateHandoffResult } from '../growthJourney/handoffs/handoffService';

/**
 * M33 - create_journey_handoff: Maya hands a person to a human, for real, with a reason.
 *
 * The ONLY way Maya hands a person to the admissions team (Ali, 2026-11-09, M30 "Q1: A": the never-fired voice
 * handoff in synthflowWebhookController was retired in favor of this). Callers: the Campus tour opt-in
 * (campus/campusTourHandoff.ts, reason campus_tour_opt_in) and Maya's portal DM (M31, reasons maya_dm_*).
 *
 * Generalized from the C7 tour opt-in without changing its behavior; that file's docblock is the history.
 *
 * THE ANSWER IS WHAT THE WRITER RETURNED, nothing else. A caller may tell a person "someone will reach out" ONLY when
 * handoff is true, because only then does a row exist:
 *   created       new row, open                      -> handoff true
 *   already_open  replayed onto an open row          -> handoff true (one row; the same handoff twice yields one)
 *   closed        replayed onto a closed row         -> handoff false
 *   disabled      GROWTH_JOURNEY_HANDOFFS off        -> handoff false, nothing queried
 *   unavailable   brand absent or the writer threw   -> handoff false, NOTHING was written
 *
 * IDEMPOTENCY: event_ref = <reasonCode>:<enrollment>:<Central date>, and the writer's open-row indexes return the
 * existing row while any handoff for the subject is open. After admissions closes it, a later day opens a new one.
 *
 * PAUSE (M5): human ownership is taken when admissions ACCEPTS the handoff (dispositionService.acceptHandoff), and
 * the Explorer governor stops proposing contact for that learner while it is accepted and open (M35, humanOwned).
 *
 * FAILURE MODES HANDLED: flag off, brand/program missing, lead unresolvable (null lead is fine; the subject is the
 * enrollment), writer throw, assignment throw (row kept, still true). NOT handled here: delivery of any message, which
 * this module never does. Never throws. No email ever goes into refs (the packet refuses addresses).
 */

export type JourneyHandoffReason = 'created' | 'already_open' | 'closed' | 'disabled' | 'unavailable';
export interface JourneyHandoffResult { handoff: boolean; reason: JourneyHandoffReason }

/** Stable codes stored on the row (the Growth tab's Reason), each with the plain-English label the queue shows. */
export const HANDOFF_REASON_LABELS = Object.freeze({
  campus_tour_opt_in: 'Finished the whole tour',
  maya_dm_seat_count: 'Asked Maya how many seats are left',
  maya_dm_deadline: 'Asked Maya about a deadline',
  maya_dm_consent: 'Asked Maya about consent or their data',
  maya_dm_cohort_date: 'Asked Maya when the next cohort starts',
  maya_dm_request: 'Asked Maya for a person',
} as const);

export type HandoffReasonCode = keyof typeof HANDOFF_REASON_LABELS;

export function handoffReasonLabel(code: string): string {
  return (HANDOFF_REASON_LABELS as Record<string, string>)[code] ?? code;
}

export interface JourneyHandoffDeps {
  EXPLORER_PROGRAM: typeof ExplorerProgramConst;
  resolveBrandBySlug: (tenantSlug: string, brandSlug: string) => Promise<{ id: string; tenant_id: string; slug: string } | null>;
  findProgram: (brandId: string, slug: string) => Promise<{ id: string; slug: string; kind: 'learner' | 'business' | 'consulting' } | null>;
  resolveLeadId: (enrollmentId: string) => Promise<number | null>;
  createHandoff: (a: CreateHandoffArgs) => Promise<CreateHandoffResult>;
  assignHandoff: (row: CreateHandoffResult['row'], flags: GrowthJourneyFlags, asOf: Date) => Promise<AssignResult>;
}

export function defaultJourneyHandoffDeps(): JourneyHandoffDeps {
  const { EXPLORER_PROGRAM } = require('../growthJourney/explorerProgramBridge') as Pick<JourneyHandoffDeps, 'EXPLORER_PROGRAM'>;
  const { resolveBrandBySlug } = require('../../modules/tenancy/tenantResolver') as Pick<JourneyHandoffDeps, 'resolveBrandBySlug'>;
  const { JourneyProgram } = require('../../models') as { JourneyProgram: { findOne: (q: { where: { brand_id: string; slug: string } }) => ReturnType<JourneyHandoffDeps['findProgram']> } };
  const { resolveExplorerLead } = require('../explorerGrowth/explorerIdentityBridge') as { resolveExplorerLead: (id: string, o: { dryRun: boolean }) => Promise<{ lead_id: number | null }> };
  const { createHandoff, assignHandoff } = require('../growthJourney/handoffs/handoffService') as Pick<JourneyHandoffDeps, 'createHandoff' | 'assignHandoff'>;
  return {
    EXPLORER_PROGRAM, resolveBrandBySlug, createHandoff, assignHandoff,
    findProgram: (brandId, slug) => JourneyProgram.findOne({ where: { brand_id: brandId, slug } }),
    // dryRun: read-only, never writes explorer_journey_profiles. Only the lead id is used.
    resolveLeadId: async (id) => (await resolveExplorerLead(id, { dryRun: true })).lead_id,
  };
}

/** YYYY-MM-DD in America/Chicago (the day a handoff counts for). */
export function centralDate(asOf: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(asOf);
}

const isOpen = (status: string): boolean => (OPEN_HANDOFF_STATUSES as readonly string[]).includes(status);

function logFailure(event: string, enrollmentId: string, reasonCode: string, err: unknown): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: classifyError(err), context: { enrollment_id: enrollmentId, reason_code: reasonCode } }));
}

export interface CreateJourneyHandoffOptions {
  /** Prefix for failure log events, so the tour's existing log names are kept. */
  logPrefix?: string;
}

export async function createJourneyHandoff(
  enrollmentId: string,
  reasonCode: HandoffReasonCode,
  flags: GrowthJourneyFlags = env.growthJourney,
  asOf: Date = new Date(),
  deps?: JourneyHandoffDeps,
  opts: CreateJourneyHandoffOptions = {},
): Promise<JourneyHandoffResult> {
  const prefix = opts.logPrefix ?? 'maya_journey_handoff';
  if (!isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags)) return { handoff: false, reason: 'disabled' };
  let created: CreateHandoffResult;
  let d: JourneyHandoffDeps;
  try {
    d = deps ?? defaultJourneyHandoffDeps(); // inside the try: a module that fails to load is "unavailable"
    const brand = await d.resolveBrandBySlug(d.EXPLORER_PROGRAM.tenantSlug, d.EXPLORER_PROGRAM.brandSlug);
    if (!brand) return { handoff: false, reason: 'unavailable' };
    const [program, leadId] = await Promise.all([d.findProgram(brand.id, d.EXPLORER_PROGRAM.programSlug), d.resolveLeadId(enrollmentId)]);
    created = await d.createHandoff({
      refs: {
        tenant_id: brand.tenant_id, brand_id: brand.id, brand_slug: brand.slug,
        program: program ? { id: program.id, slug: program.slug, kind: program.kind } : null,
        // The shared builder (identity T208 tripwire): enrollment outranks lead, so this is enrollment:<id>.
        subject_ref: subjectRefFrom({ enrollmentId }) as string, lead_id: leadId, enrollment_id: enrollmentId, path: null,
      },
      trigger: { source: 'manual', owner_queue: 'admissions', reason: reasonCode, urgent_hint: false,
        event_ref: `${reasonCode}:${enrollmentId}:${centralDate(asOf)}` },
      decision: null,
      asOf,
    });
  } catch (err: unknown) {
    logFailure(`${prefix}_failed`, enrollmentId, reasonCode, err);
    return { handoff: false, reason: 'unavailable' };
  }
  const { row, replayed } = created;
  if (!isOpen(row.status)) return { handoff: false, reason: 'closed' };
  if (!replayed) {
    try {
      await d.assignHandoff(row, flags, asOf);
    } catch (err: unknown) {
      logFailure(`${prefix}_assign_failed`, enrollmentId, reasonCode, err); // the row exists and stays queued
    }
  }
  return { handoff: true, reason: replayed ? 'already_open' : 'created' };
}
