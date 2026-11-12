import { rolloutScopeKey, type RolloutScope } from './scopeKey';
import { scrubField } from '../readiness/scrubField';
import type { GrowthJourneyControlMode } from '../../../models/GrowthJourneyExecutionControl';

/**
 * The first rollout control row, composed and validated but NEVER written (MR3).
 *
 * ── WHY THE ROLLOUT ROW IS THE DECISIVE LOCK ────────────────────────────────
 *
 * MR3 lists five locks and this is not one of them, which is the ticket's biggest omission after
 * the classification gap. `resolveExecutionMode.ts:143` is literally:
 *
 *     if (!rollout) return result('shadow', 'no_rollout');
 *
 * The two control defaults are **asymmetric**, and the asymmetry is the whole point:
 *
 *   - a **pause ALLOWS by default** - no pause row means nothing is stopped;
 *   - a **rollout DENIES by default** - no rollout row means nothing is permitted live.
 *
 * `growth_journey_execution_controls` holds **zero rows** in production. So every scope resolves
 * to `shadow` with reason `no_rollout` even with all five of the ticket's locks flipped: the
 * master flag on, execution on, every agent row enabled, a programme activated. Somebody could
 * do all five of those things, see nothing happen, and have no idea why.
 *
 * ── WHAT THIS DOES, AND WHAT IT REFUSES TO DO ───────────────────────────────
 *
 * It composes the exact row the write route would need and returns it. It does not insert it.
 * Writing this row is the act that permits a scope to leave shadow, which makes it a decision
 * with an owner rather than an implementation detail - the same reason MR3's own escalation note
 * gives for the execution flag.
 *
 * The key is built by the **real** `rolloutScopeKey`, never by string concatenation. That
 * matters for one specific reason: the real parser **throws** on an under-specified scope
 * (`scopeKey.ts:51-56` rejects any falsy brand, programme or channel), because a rollout with a
 * missing dimension would silently widen to something nobody chose. A local copy of the grammar
 * would drift from the parser that the write route and `findActiveRollout` both use, and the
 * drift would show up as a row that matches nothing.
 *
 * ── THE DEFAULTS ARE THE SMALLEST FIRST ROLLOUT, NOT THE WIDEST ─────────────
 *
 * `review` rather than `limited`, and a daily limit rather than none. `review` files a proposal
 * and claims nothing, so the first live scope still cannot send without a human looking at it;
 * `limited` executes under a cap. Starting at `review` means the first rollout produces something
 * to read rather than something to undo.
 */

/** The row the write route needs. Field names match the model's columns. */
export interface PlannedRollout {
  kind: 'rollout';
  scope_key: string;
  brand_id: string;
  program_id: string;
  channel: string;
  mode: GrowthJourneyControlMode;
  daily_limit: number;
  reason: string;
  /** Always false. Stated as a field so a caller cannot mistake this for a written row. */
  written: false;
}

export interface FirstRolloutRequest extends RolloutScope {
  /** Defaults to `review`: files a proposal, claims nothing. */
  mode?: GrowthJourneyControlMode;
  /** Defaults to 5. A first rollout with no cap is not a first rollout. */
  dailyLimit?: number;
  /** Why this scope, in the operator's words. Recorded on the row. */
  reason?: string;
}

/** The conservative default. `review` cannot send without a human; `limited` can. */
export const DEFAULT_FIRST_ROLLOUT_MODE: GrowthJourneyControlMode = 'review';

/** A first rollout with no cap is not a first rollout. */
export const DEFAULT_FIRST_ROLLOUT_DAILY_LIMIT = 5;

/**
 * Compose and validate the first rollout row. Throws `ScopeKeyError` on an under-specified
 * scope, from the real parser, rather than emitting a half-formed key.
 */
export function planFirstRollout(req: FirstRolloutRequest): PlannedRollout {
  // The real parser, and it is called FIRST so an invalid scope fails before anything else is
  // computed. It throws; that is the behaviour being borrowed, not worked around.
  const scope_key = rolloutScopeKey({
    brandId: req.brandId,
    programId: req.programId,
    channel: req.channel,
  });

  const mode = req.mode ?? DEFAULT_FIRST_ROLLOUT_MODE;
  const daily_limit = req.dailyLimit ?? DEFAULT_FIRST_ROLLOUT_DAILY_LIMIT;

  if (!Number.isInteger(daily_limit) || daily_limit < 1) {
    throw new RangeError('a first rollout needs a daily limit of at least 1');
  }

  return {
    kind: 'rollout',
    scope_key,
    brand_id: req.brandId,
    program_id: req.programId,
    channel: req.channel,
    mode,
    daily_limit,
    reason: req.reason ?? 'first rollout, one brand and one channel, under a daily cap',
    written: false,
  };
}

/**
 * The planned row as lines a person can read, plus what writing it would permit.
 *
 * `reason` IS SCRUBBED, and that was a real defect rather than belt-and-braces. The first
 * version rendered it raw, on the reasoning that every other value here is a uuid, a channel
 * name or an integer - which is true, and misses that `reason` is the one field an operator
 * types. The journey tree's rule is that no output carries an `@`, ever, and the field most
 * likely to carry one is the free-text one. A test asked for it and the renderer leaked.
 */
export function describePlannedRollout(p: PlannedRollout): string[] {
  return [
    'PLANNED, NOT WRITTEN. Nothing below exists in the database.',
    `  scope      : ${p.scope_key}`,
    `  mode       : ${p.mode}${p.mode === 'review' ? ' (files a proposal; claims and sends nothing)' : ''}`,
    `  daily limit: ${p.daily_limit}`,
    `  reason     : ${scrubField(p.reason)}`,
    '',
    'Writing this row is what permits this one scope to leave shadow. Until it exists,',
    'resolveExecutionMode answers shadow/no_rollout for every scope - a rollout denies by',
    'default, unlike a pause, which allows by default.',
    '',
    `To write it: POST /api/admin/growth-journey/execution/rollouts with scope ${p.scope_key}.`,
  ];
}
