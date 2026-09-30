import { resolveExplorerGrowthFlags, type ExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
import type { GrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import type { GrowthJourneyDecisionAttributes, GrowthJourneyDecisionMode } from '../../../models/GrowthJourneyDecision';
import { classifyError } from '../../../utils/errorClassifier';
import { computeIdempotencyKey } from '../../inboxCase/textNormalization';
import { resolveExecutionMode, type ExecutionChannel, type ExecutionMode } from '../execution/resolveExecutionMode';
import type { JourneyDecision, JourneySubjectContext } from '../governor/types';

/**
 * T507 — the decision row says whether it may execute.
 *
 * A decision is written `live` only when T504's ladder answers `review` or
 * `limited` for the selected action's channel; everything else - a WAIT, a
 * suppression, an action nothing in this phase can execute, a flag off, the
 * kill switch, a pause, no rollout, a subject outside the cohort, a ladder that
 * could not be read - stays `shadow`, and the row says why in
 * `eligibility.execution_mode`.
 *
 * ─── THE KEY MOVES ONLY FOR LIVE ────────────────────────────────────────────
 *
 * The idempotency key gains the mode only when it is `live`. Every shadow row
 * therefore keeps the key it has always had - the Phase 3 and 4 suites pin
 * those - and a subject decided in shadow yesterday is decided AGAIN, on a new
 * key, the day its brand's rollout reaches it. A subject decided `live` and
 * replayed lands on its own row, exactly as before.
 *
 * ─── FAIL CLOSED ────────────────────────────────────────────────────────────
 *
 * The ladder reads control rows and the kill switch. If that read throws, the
 * decision is still recorded - in shadow, with the error class named - and
 * nothing here is ever raised to `live` by an error.
 */

/** The ladder's answers that make a decision `live`. */
export const LIVE_MODES: readonly ExecutionMode[] = ['review', 'limited'];

/** Stamped onto every row under `eligibility.execution_mode`. */
export interface ExecutionModeStamp {
  mode: GrowthJourneyDecisionMode;
  reason: string;
  /** The ladder's own answer, when it was asked; null when the decision had nothing to execute. */
  resolved: ExecutionMode | null;
  channel: ExecutionChannel | null;
  control_ids: string[];
}

/** The actions this phase can hand to a channel, and the channel each one is executed on. */
const CHANNEL_BY_ACTION: Readonly<Record<string, ExecutionChannel>> = Object.freeze({
  SEND_EMAIL: 'email',
  SHOW_IN_APP_NUDGE: 'in_app',
  SEND_ALI_OUTREACH: 'ali_outreach',
  // Named so the ladder can REFUSE them by name (`channel_not_authorized`), never executed.
  SEND_SMS: 'sms',
  SCHEDULE_VOICE: 'voice',
});

const NEVER_EXECUTED: ReadonlySet<string> = new Set(['WAIT', 'SUPPRESS_CONTACT']);

const shadow = (reason: string, channel: ExecutionChannel | null = null): ExecutionModeStamp => ({
  mode: 'shadow', reason, resolved: null, channel, control_ids: [],
});

/**
 * The channel the ladder is asked about for a decision, or why there is none.
 * A selected channel of `sms` or `voice` wins over the action's own, so a
 * candidate that somehow names one is refused by the ladder rather than
 * silently re-routed.
 */
export function executionChannelOf(decision: Pick<JourneyDecision, 'selected_action' | 'selected_channel'>): { channel: ExecutionChannel } | { channel: null; reason: string } {
  const action = decision.selected_action;
  if (!action || NEVER_EXECUTED.has(action)) return { channel: null, reason: `no_action:${action ?? 'none'}` };
  if (decision.selected_channel === 'sms' || decision.selected_channel === 'voice') return { channel: decision.selected_channel };
  const channel = CHANNEL_BY_ACTION[action];
  return channel ? { channel } : { channel: null, reason: `action_not_executable:${action}` };
}

export interface ResolveStampArgs {
  ctx: Pick<JourneySubjectContext, 'tenant_id' | 'brand_id' | 'program_id' | 'subject_ref' | 'lead_id' | 'asOf'>;
  decision: Pick<JourneyDecision, 'selected_action' | 'selected_channel'>;
  flags: GrowthJourneyFlags;
  /** Defaults to the process's own Explorer flags; the nightly passes `env.explorerGrowth`, a test its own. */
  explorerFlags?: ExplorerGrowthFlags;
}

/** Ask the ladder once, for the selected action's channel. Never throws; never raises on error. */
export async function resolveDecisionExecutionMode(args: ResolveStampArgs): Promise<ExecutionModeStamp> {
  const target = executionChannelOf(args.decision);
  if (target.channel === null) return shadow(target.reason);
  const { ctx } = args;
  // A rollout is scoped to a programme; a context without one has nothing to roll out under.
  if (ctx.program_id === null) return shadow('no_program', target.channel);
  try {
    const r = await resolveExecutionMode({
      tenantId: ctx.tenant_id,
      brandId: ctx.brand_id,
      programId: ctx.program_id,
      channel: target.channel,
      subjectRef: ctx.subject_ref,
      leadId: ctx.lead_id ?? null,
      asOf: ctx.asOf,
      flags: args.flags,
      explorerFlags: args.explorerFlags ?? resolveExplorerGrowthFlags(),
    });
    return { mode: LIVE_MODES.includes(r.mode) ? 'live' : 'shadow', reason: r.reason, resolved: r.mode, channel: target.channel, control_ids: r.control_ids };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    console.error(JSON.stringify({
      level: 'error', service: 'growth-journey', event: 'growth_journey.decision.execution_mode_unavailable', outcome: 'failure',
      error_class, context: { tenant_id: ctx.tenant_id, brand_id: ctx.brand_id, channel: target.channel },
    }));
    return shadow(`execution_mode_unavailable:${error_class}`, target.channel);
  }
}

/**
 * The row with its mode. Pure. A shadow stamp leaves the row byte-identical
 * to the writer's - same mode, same key - plus the stamp under `eligibility`;
 * a live stamp flips the mode and derives the key from the shadow key, so the
 * two can never collide and no shadow key ever moves.
 */
export function withExecutionMode(row: GrowthJourneyDecisionAttributes, stamp: ExecutionModeStamp): GrowthJourneyDecisionAttributes {
  return {
    ...row,
    mode: stamp.mode,
    eligibility: { ...(row.eligibility ?? {}), execution_mode: { ...stamp } },
    idempotency_key: stamp.mode === 'live' ? computeIdempotencyKey([row.idempotency_key, 'live']) : row.idempotency_key,
  };
}
