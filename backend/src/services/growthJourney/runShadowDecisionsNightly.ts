import { env } from '../../config/env';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { JourneyProgram } from '../../models';
import { OWNER_QUEUES } from '../../models/GrowthJourneyHandoff';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { runShadowDecisions, type RunShadowDecisionsResult } from './decisionService';
import { assignRankedQueue } from './handoffs/handoffService';

/**
 * The nightly batch: `GrowthJourneyShadowDecisions` (Phase 4 T408), shipped
 * PAUSED.
 *
 * ─── WHAT ONE NIGHT DOES ────────────────────────────────────────────────────
 *
 * For every journey programme - all four brands, `draft` included, because a
 * shadow decision RECORDS the programme's status rather than waiting for it -
 * T311's `runShadowDecisions` decides for every classified subject under the
 * brand (each decision materialising its own handoffs through T404's writer,
 * when `journeyHandoffs` is on), and then the queue's assignment pass runs
 * once per brand × queue, so a row that was queued yesterday for want of
 * capacity is offered today's. One brand failing is one line in the summary,
 * never the end of the run; the summary is counts only - no subject ref, no
 * address - and goes through `redactForLogs` like every other line here.
 *
 * ─── THREE GATES BEFORE A SINGLE READ ───────────────────────────────────────
 *
 * The registry row is `enabled: false` (`instrumentCronJob` skips it with a
 * warning), the master flag is off, and `journeyDecisions` is off; this
 * function checks the last two itself and answers `skipped` before any model
 * read, so the cron is dark in production three times over. Turning it on is
 * a registry toggle in Admin > Agents AND the two flags - never a redeploy.
 *
 * DECIDES AND RECORDS ONLY. Nothing here sends, enqueues or notifies; a
 * handoff is a row a human reads and a ticket is a row on a board. The
 * scheduler imports this file; this file imports nothing of the scheduler's.
 */

export const SHADOW_DECISIONS_AGENT = 'GrowthJourneyShadowDecisions';
/** 04:20 UTC: after the three Explorer jobs (02:50, 03:20, 03:50), so the learner brands decide on scores recomputed the same night. */
export const SHADOW_DECISIONS_SCHEDULE = '20 4 * * *';

export interface NightlyBrandSummary {
  brand_id: string;
  program_slug: string;
  program_status: string;
  status: 'ran' | 'disabled' | 'failed';
  subjects: number;
  recorded: number;
  replayed: number;
  skipped: number;
  errors: number;
  handoffs: RunShadowDecisionsResult['handoffs'];
  /** The nightly assignment pass over the brand's queues: rows offered, rows assigned - or its own failure, the decisions above untouched. */
  assignment: { offered: number; assigned: number } | { failed: true; error_class: string } | null;
  error_class?: string;
}

export type NightlyResult =
  | { skipped: true; reason: 'journeyDecisions_off' }
  | {
      skipped: false;
      as_of: string;
      brands: number;
      ran: number;
      failed: number;
      subjects: number;
      recorded: number;
      replayed: number;
      skipped_subjects: number;
      errors: number;
      per_brand: NightlyBrandSummary[];
    };

export interface RunScheduledShadowDecisionsOptions {
  asOf?: Date;
  /** Defaults to the process flags; a test hands in its own. */
  flags?: GrowthJourneyFlags;
  /** Per-brand cap handed to the batch runner. */
  limit?: number;
}

const EMPTY_HANDOFFS: RunShadowDecisionsResult['handoffs'] = { disabled: 0, none: 0, materialized: 0, assigned: 0, queued: 0 };

function log(event: string, fields: Record<string, unknown>): void {
  console.log(redactForLogs(JSON.stringify({ timestamp: new Date().toISOString(), service: 'growth-journey', level: 'info', event, ...fields })));
}

/** The assignment pass for one brand: every queue, ranked, through the gates. Counts only. */
async function assignmentPass(brandId: string, flags: GrowthJourneyFlags, asOf: Date): Promise<{ offered: number; assigned: number }> {
  let offered = 0;
  let assigned = 0;
  for (const ownerQueue of OWNER_QUEUES) {
    const rows = await assignRankedQueue({ brandId, ownerQueue, flags, asOf });
    offered += rows.length;
    assigned += rows.filter((r) => r.assignment.status === 'assigned').length;
  }
  return { offered, assigned };
}

async function guardedAssignmentPass(base: { brand_id: string; program_slug: string }, flags: GrowthJourneyFlags, asOf: Date): Promise<NightlyBrandSummary['assignment']> {
  try {
    return await assignmentPass(base.brand_id, flags, asOf);
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.nightly.assignment_failed', { brand_id: base.brand_id, program_slug: base.program_slug, error_class });
    return { failed: true, error_class };
  }
}

export async function runScheduledShadowDecisions(options: RunScheduledShadowDecisionsOptions = {}): Promise<NightlyResult> {
  const flags = options.flags ?? env.growthJourney;
  if (!isGrowthJourneyCapabilityEnabled('journeyDecisions', flags)) {
    return { skipped: true, reason: 'journeyDecisions_off' };
  }
  const asOf = options.asOf ?? new Date();
  const programs = await JourneyProgram.findAll({
    where: { status: ['draft', 'active', 'paused'] },
    attributes: ['id', 'brand_id', 'slug', 'status'],
    order: [['slug', 'ASC']],
  });

  const per_brand: NightlyBrandSummary[] = [];
  for (const program of programs) {
    const base = { brand_id: String(program.brand_id), program_slug: String(program.slug), program_status: String(program.status) };
    try {
      const r = await runShadowDecisions({ brandId: base.brand_id, trigger: 'nightly', flags, asOf, limit: options.limit });
      // The pass has its own failure domain: the decisions above are on disk whatever happens
      // to the queues, and the summary says so instead of zeroing the brand (the T408 verifier).
      const assignment = r.status === 'ran' && isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags) ? await guardedAssignmentPass(base, flags, asOf) : null;
      per_brand.push({
        ...base,
        status: r.status,
        subjects: r.subjects,
        recorded: r.recorded,
        replayed: r.replayed,
        skipped: r.skipped.length,
        errors: r.errors.length,
        handoffs: r.handoffs,
        assignment,
      });
    } catch (err: unknown) {
      // One brand's failure is one line here; the next brand still runs.
      const error_class = classifyError(err);
      per_brand.push({ ...base, status: 'failed', subjects: 0, recorded: 0, replayed: 0, skipped: 0, errors: 0, handoffs: { ...EMPTY_HANDOFFS }, assignment: null, error_class });
      log('growth_journey.nightly.brand_failed', { brand_id: base.brand_id, program_slug: base.program_slug, error_class });
    }
  }

  const total = (pick: (b: NightlyBrandSummary) => number) => per_brand.reduce((sum, b) => sum + pick(b), 0);
  const result: NightlyResult = {
    skipped: false,
    as_of: asOf.toISOString(),
    brands: per_brand.length,
    ran: per_brand.filter((b) => b.status === 'ran').length,
    failed: per_brand.filter((b) => b.status === 'failed').length,
    subjects: total((b) => b.subjects),
    recorded: total((b) => b.recorded),
    replayed: total((b) => b.replayed),
    skipped_subjects: total((b) => b.skipped),
    errors: total((b) => b.errors),
    per_brand,
  };
  // Counts only: brand ids, programme slugs and statuses, numbers. No subject ref, no address.
  log('growth_journey.nightly.summary', { ...result, per_brand: per_brand.map(({ brand_id, program_slug, program_status, status, subjects, recorded, replayed, skipped, errors, handoffs, assignment, error_class }) => ({ brand_id, program_slug, program_status, status, subjects, recorded, replayed, skipped, errors, handoffs, assignment, error_class })) });
  return result;
}
