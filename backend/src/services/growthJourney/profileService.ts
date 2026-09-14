import { GrowthJourneyProfile } from '../../models';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { recordTransition } from './transitionService';
import type { ScoreVector } from './governor/types';

/**
 * The profile projection, and the one place a state change is recorded
 * (§6.1; Phase 3 T307).
 *
 * ─── THE PROFILE IS THE ONLY MUTABLE WRITE THIS RUN OWNS ────────────────────
 *
 * `growth_journey_profiles` is a projection of where a subject currently stands,
 * so it is updated in place. Everything else this phase writes is append-only:
 * classifications, transitions, decisions and score snapshots. That asymmetry is
 * deliberate and it is why this file holds `update` and the transition writer
 * does not — a file allowed to mutate must not also hold an append-only model,
 * which is the rule the append-only guard enforces by scanning for both.
 *
 * ─── EVERY STATE CHANGE IS ALSO AN APPEND-ONLY ROW ──────────────────────────
 *
 * The projection tells you where someone is; it cannot tell you how they got
 * there, and overwriting it loses the answer. So a change also writes one
 * `growth_journey_transitions` row of type `state_changed` through Phase 2's
 * existing `recordTransition` — not a second writer, and not a second
 * idempotency scheme. Replay-safe by construction: the key is hashed from what
 * changed and who asked, so the same change recorded twice is one row.
 *
 * ─── A FAILED AUDIT WRITE IS A LOST AUDIT ROW, NOT A DEFERRED ONE ───────────
 *
 * The projection is written first, so a failed transition write leaves the live
 * state correct — which is the right trade, because losing the audit row is bad
 * and losing the current state is worse.
 *
 * But it is a LOSS, and an earlier version of this comment claimed "the next run
 * records the change". It cannot: `stateChanged` is derived from the projection,
 * which already holds the new state, so the next run computes no change and
 * never retries. That hop is gone from the transitions table permanently. A test
 * pins exactly that, because a comment claiming a recovery nobody implemented is
 * worse than no comment.
 *
 * Repairing it needs a pass that compares projections against their transition
 * history and backfills the gaps — Phase 4, and out of scope here. What this
 * file does instead is log the loss with both states, so the gap is at least
 * findable.
 *
 * ─── NO STATE CHANGE, NO TRANSITION, NO NEW TIMESTAMP ───────────────────────
 *
 * A nightly re-run that reaches the same state writes no transition and leaves
 * `state_entered_at` alone. Getting that wrong would fill the transitions table
 * with rows saying nothing happened, and reset every duration rule that reads
 * the timestamp.
 */

export interface UpsertProfileArgs {
  tenantId: string;
  brandId: string;
  programId: string | null;
  subjectRef: string;
  leadId: number | null;
  enrollmentId: string | null;
  state: string;
  stateEnteredAt: Date;
  overlays: string[];
  scores: ScoreVector | null;
  /** Why this state — the lifecycle's own evidence strings. */
  evidence: string[];
  /** `classifier` | `cron:<name>` | `human:<admin id>` */
  source: string;
  /**
   * The instant this run reasoned about — the SAME one the lifecycle used.
   *
   * Not a clock of this service's own: it stamps `updated_at` and it buckets the
   * transition's idempotency key by day, and a second clock would make the two
   * disagree on a run that straddles midnight.
   */
  asOf: Date;
}

export interface UpsertProfileResult {
  profileId: string;
  previousState: string | null;
  stateChanged: boolean;
  /** Set only when a state change was recorded. */
  transitionId: string | null;
  transitionReplayed: boolean;
}

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(
    redactForLogs(
      JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields }),
    ),
  );
}

/**
 * Write the projection, and record the transition when the state really moved.
 *
 * Order matters: the profile is written FIRST, then the transition. If the
 * transition write fails, the projection is still correct and the next run
 * records the change — the reverse order would leave a transition claiming a
 * state the profile does not hold.
 */
export async function upsertProfile(args: UpsertProfileArgs): Promise<UpsertProfileResult> {
  const existing = await GrowthJourneyProfile.findOne({
    where: { brand_id: args.brandId, subject_ref: args.subjectRef },
  });

  const previousState = existing ? String(existing.state) : null;
  const stateChanged = previousState !== args.state;

  const payload = {
    tenant_id: args.tenantId,
    brand_id: args.brandId,
    program_id: args.programId,
    subject_ref: args.subjectRef,
    lead_id: args.leadId,
    enrollment_id: args.enrollmentId,
    state: args.state,
    // Supplied by the lifecycle, which moves it only on a real change. This
    // service does not recompute it: two places deciding when the clock resets
    // is two places to get it wrong.
    state_entered_at: args.stateEnteredAt,
    overlays: args.overlays,
    scores: args.scores as unknown as Record<string, unknown> | null,
    score_gaps: args.scores?.gaps ?? [],
    scores_computed_at: args.scores?.computed_at ?? null,
    signals_summary: { evidence: args.evidence },
    source: args.source,
    updated_at: args.asOf,
  };

  let profileId: string;
  if (existing) {
    await existing.update(payload);
    profileId = String(existing.id);
  } else {
    const created = await GrowthJourneyProfile.create(payload);
    profileId = String(created.id);
  }

  if (!stateChanged) {
    return { profileId, previousState, stateChanged: false, transitionId: null, transitionReplayed: false };
  }

  try {
    const { row, replayed } = await recordTransition({
      tenantId: args.tenantId,
      brandId: args.brandId,
      programId: args.programId,
      subjectRef: args.subjectRef,
      leadId: args.leadId,
      enrollmentId: args.enrollmentId,
      type: 'state_changed',
      from: previousState === null ? null : { state: previousState },
      to: { state: args.state, overlays: args.overlays },
      reason: args.evidence[0] ?? 'state recomputed',
      evidence: args.evidence,
      requestedBy: args.source,
      // WHAT we moved from, and WHEN. Both are needed and neither is enough
      // alone: these states regress and re-advance by design, so a re-advance
      // has the same `from` AND the same `to` as the first advance and would
      // hash to it. The day bucket is Explorer's own idiom — its decisions are
      // unique per `(enrollment_id, decision_date)`.
      //
      // The remaining limitation, stated rather than hidden: a subject that
      // regresses and re-advances within ONE day still collapses to a single
      // row. Same trade Explorer's daily key makes, and the narrow case.
      keyParts: [`from:${previousState ?? 'none'}`, `day:${args.asOf.toISOString().slice(0, 10)}`],
    });
    return {
      profileId,
      previousState,
      stateChanged: true,
      transitionId: String(row.id),
      transitionReplayed: replayed,
    };
  } catch (err: unknown) {
    // The projection is already correct and this row is LOST — not deferred. The
    // next run derives `stateChanged` from the projection, finds no change, and
    // never retries. Logged with both states so the gap can be found later.
    log('growth_journey.state_transition_write_failed', {
      error_class: classifyError(err),
      brand_id: args.brandId,
      subject_ref: args.subjectRef,
      from_state: previousState,
      to_state: args.state,
    });
    return { profileId, previousState, stateChanged: true, transitionId: null, transitionReplayed: false };
  }
}
