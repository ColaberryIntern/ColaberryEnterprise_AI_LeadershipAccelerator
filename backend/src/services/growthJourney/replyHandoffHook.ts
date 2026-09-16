import { env } from '../../config/env';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import type { GrowthJourneyOwnerQueue } from '../../models/GrowthJourneyHandoff';
import { classifyError } from '../../utils/errorClassifier';
import type { EXPLORER_PROGRAM as ExplorerProgramConst } from './explorerProgramBridge';
import type { AssignResult, CreateHandoffArgs, CreateHandoffResult } from './handoffs/handoffService';

/**
 * The one line the Explorer reply route adds (Phase 4 T404): when
 * `mandrillWebhookController` has classified a reply as a HUMAN_TASK route -
 * `READY_TO_ENROLL`, `NEEDS_ALI`, `NEEDS_HELP` - and only logged it, persist
 * that as a handoff in the queue the class names. `NOT_INTERESTED` and every
 * generator-answered class yield nothing.
 *
 * Same contract as `replyClassificationHook`: fire-and-forget, never throws,
 * never awaited by the webhook's response, changes no status code; the heavy
 * modules are required lazily so controllers loaded by tests without a
 * database do not construct Sequelize at import. Master-gated AND gated on
 * `journeyHandoffs` through the flags module - no environment variable is
 * read here. While off (production today), `{ status: 'disabled' }` before
 * touching anything.
 *
 * The controller has no brand in scope, so the hook resolves Explorer's own
 * brand from `EXPLORER_PROGRAM` - the one brand an Explorer reply route can
 * mean - required lazily too, because the bridge module imports the models.
 * The import runs webhook -> growthJourney, never the reverse.
 */

export const QUEUE_BY_REPLY_CLASS: Readonly<Record<string, GrowthJourneyOwnerQueue>> = Object.freeze({
  READY_TO_ENROLL: 'admissions',
  NEEDS_ALI: 'ali',
  NEEDS_HELP: 'support',
});

export interface ReplyHandoffArgs {
  leadId: number;
  replyClass: string | null;
}

export type ReplyHandoffResult =
  | { status: 'disabled' }
  | { status: 'no_handoff'; reason: string }
  | { status: 'recorded'; handoff_id: string; replayed: boolean; owner_queue: GrowthJourneyOwnerQueue; assignment: AssignResult['status'] };

interface Lazy {
  EXPLORER_PROGRAM: typeof ExplorerProgramConst;
  resolveBrandBySlug: (tenantSlug: string, brandSlug: string) => Promise<{ id: string; tenant_id: string; slug: string } | null>;
  JourneyProgram: { findOne: (q: { where: { brand_id: string; slug: string } }) => Promise<{ id: string; slug: string; kind: 'learner' | 'business' | 'consulting' } | null> };
  createHandoff: (a: CreateHandoffArgs) => Promise<CreateHandoffResult>;
  assignHandoff: (row: CreateHandoffResult['row'], flags: GrowthJourneyFlags, asOf: Date) => Promise<AssignResult>;
}

function lazy(): Lazy {
  const { EXPLORER_PROGRAM } = require('./explorerProgramBridge') as Pick<Lazy, 'EXPLORER_PROGRAM'>;
  const { resolveBrandBySlug } = require('../../modules/tenancy/tenantResolver') as Pick<Lazy, 'resolveBrandBySlug'>;
  const { JourneyProgram } = require('../../models') as Pick<Lazy, 'JourneyProgram'>;
  const { createHandoff, assignHandoff } = require('./handoffs/handoffService') as Pick<Lazy, 'createHandoff' | 'assignHandoff'>;
  return { EXPLORER_PROGRAM, resolveBrandBySlug, JourneyProgram, createHandoff, assignHandoff };
}

function logFailure(leadId: number, err: unknown): void {
  console.error(JSON.stringify({ service: 'growth-journey', event: 'growth_journey.handoff.reply_hook_failed', lead_id: leadId, error_class: classifyError(err) }));
}

export async function recordReplyHandoff(args: ReplyHandoffArgs, flags: GrowthJourneyFlags = env.growthJourney, asOf: Date = new Date()): Promise<ReplyHandoffResult> {
  if (!isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags)) return { status: 'disabled' };
  const owner_queue = args.replyClass ? QUEUE_BY_REPLY_CLASS[args.replyClass] : undefined;
  if (!owner_queue) return { status: 'no_handoff', reason: `class_not_routed:${args.replyClass ?? 'none'}` };
  try {
    const l = lazy();
    const brand = await l.resolveBrandBySlug(l.EXPLORER_PROGRAM.tenantSlug, l.EXPLORER_PROGRAM.brandSlug);
    if (!brand) return { status: 'no_handoff', reason: 'explorer_brand_absent' };
    const program = await l.JourneyProgram.findOne({ where: { brand_id: brand.id, slug: l.EXPLORER_PROGRAM.programSlug } });
    const { row, replayed } = await l.createHandoff({
      refs: {
        tenant_id: brand.tenant_id, brand_id: brand.id, brand_slug: brand.slug,
        program: program ? { id: program.id, slug: program.slug, kind: program.kind } : null,
        subject_ref: `lead:${args.leadId}`, lead_id: args.leadId, enrollment_id: null, path: null,
      },
      trigger: { source: 'reply_route', owner_queue, reason: `reply_class:${args.replyClass}`, urgent_hint: args.replyClass === 'READY_TO_ENROLL' },
      decision: null,
      asOf,
    });
    const assignment = await l.assignHandoff(row, flags, asOf);
    return { status: 'recorded', handoff_id: row.id, replayed, owner_queue, assignment: assignment.status };
  } catch (err: unknown) {
    logFailure(args.leadId, err);
    return { status: 'no_handoff', reason: `hook_failed:${classifyError(err)}` };
  }
}
