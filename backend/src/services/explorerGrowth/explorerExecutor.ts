/**
 * Explorer Growth OS — turn a recorded decision into queued work. Plan §28
 * (EPIC 6).
 *
 * THIS FILE SENDS NOTHING, AND CANNOT. It creates a `pending` ScheduledEmail —
 * the existing campaign engine's unit of work — and records its id on the
 * decision. The engine then picks it up and runs it through the machinery that
 * already exists: `evaluateSend` (test mode, suppression, rate limits),
 * generation from the composite context, and `messageValidatorService`, which
 * is where the Explorer fact guard fires.
 *
 * That indirection is the whole design. The brief was explicit that there must
 * not be a second campaign engine, and reusing the first one means every guard
 * built over the past week applies here for free rather than being
 * reimplemented — badly, and one at a time, in the place where mistakes reach
 * people.
 *
 * IT IS THE LAST SWITCH BEFORE A LEARNER RECEIVES SOMETHING. Everything
 * upstream produces data. This produces an outbound job. `EXPLORER_EXECUTION_ENABLED`
 * is separate from the Governor's flag for exactly that reason: deciding what
 * WOULD be sent and actually sending it are different risks.
 */
import { Op } from 'sequelize';
import { ExplorerJourneyDecision, Campaign } from '../../models';
import { getAllSettings } from '../settingsService';
import {
  resolveStaggerConfig,
  planStagger,
  nextWindowOpen,
  STAGGER_DEFAULTS,
} from './explorerSendSchedule';
import ScheduledEmail from '../../models/ScheduledEmail';
import { env } from '../../config/env';
import { isExplorerFeatureEnabled } from '../../config/explorerGrowthFlags';
import { redactForLogs } from '../../utils/piiRedaction';

/**
 * A decision older than this is not executed.
 *
 * It was made against scores, a journey state and a content selection that were
 * true at the time. Acting on a week-old decision means messaging someone about
 * where they were, not where they are — and the recompute runs nightly, so a
 * fresh decision is never far away. Stale ones are skipped, not queued.
 */
export const DECISION_FRESHNESS_HOURS = 36;

/**
 * The zone the send window is expressed in.
 *
 * Matches `campaignSendWindow`'s own default, so the stagger and the engine's
 * window check agree about what "8am" means. If they disagreed, slots would be
 * placed outside the window the engine enforces and every one of them would be
 * deferred — a schedule that looks planned and never sends.
 */
export const EXPLORER_SEND_TIMEZONE = 'America/Chicago';

export interface ExecutionResult {
  attempted: number;
  queued: number;
  skipped: number;
  reasons: Record<string, number>;
  /** Did not fit in today's window; left unexecuted for the next run. */
  deferredToNextDay?: number;
  /** Minutes between sends, so a run's shape is visible in the log. */
  gapMinutes?: number;
  /** First and last send time planned, for the same reason. */
  firstSendAt?: string;
  lastSendAt?: string;
}

const emptyResult = (): ExecutionResult => ({ attempted: 0, queued: 0, skipped: 0, reasons: {} });

function note(result: ExecutionResult, reason: string): void {
  result.skipped += 1;
  result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
}

/**
 * Queue one decision, or explain why not.
 *
 * Every gate re-checks something the Governor already checked, and that is
 * deliberate: the decision was recorded at 03:50 and this runs later. A
 * campaign can be paused, a learner can opt out, and a decision can go stale in
 * between. The Governor's verdict is a proposal, not a warrant.
 */
export async function executeDecision(
  decision: {
    id: string;
    lead_id: number | null;
    selected_action: string | null;
    selected_campaign_id: string | null;
    selected_sequence_step: number | null;
    channel: string | null;
    executed: boolean;
    scheduled_email_id: string | null;
    created_at: Date | string;
  },
  now: Date,
  result: ExecutionResult,
  /**
   * When this send should go out. Undefined means "as soon as the window
   * allows", which is what the caller passes when staggering is off.
   */
  sendAt?: Date,
): Promise<void> {
  result.attempted += 1;

  // Idempotency, checked first and cheapest. A decision that already produced a
  // scheduled email must never produce a second one: this cron can overlap with
  // itself and a duplicate here is a duplicate email to a real person.
  if (decision.executed || decision.scheduled_email_id) {
    note(result, 'already_executed');
    return;
  }

  if (decision.selected_action !== 'SEND_EMAIL') {
    // WAIT and RECOMMEND_LESSON are decisions too, and neither is an email.
    note(result, 'not_a_send');
    return;
  }

  if (!decision.lead_id) {
    note(result, 'no_lead');
    return;
  }

  if (!decision.selected_campaign_id) {
    // No campaign means no sender identity, no sequence and no reply routing.
    note(result, 'no_campaign');
    return;
  }

  const ageHours = (now.getTime() - new Date(decision.created_at).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours > DECISION_FRESHNESS_HOURS) {
    note(result, 'stale_decision');
    return;
  }

  // Re-check the campaign NOW, not as the Governor saw it. Pausing a campaign
  // is how a human stops a send, and it has to work on decisions already made.
  const campaign = await Campaign.findByPk(decision.selected_campaign_id, {
    attributes: ['id', 'status', 'sequence_id'],
  });
  if (!campaign || (campaign as { status: string }).status !== 'active') {
    note(result, 'campaign_not_active');
    return;
  }

  const scheduled = await ScheduledEmail.create({
    lead_id: decision.lead_id,
    campaign_id: decision.selected_campaign_id,
    sequence_id: (campaign as { sequence_id?: string | null }).sequence_id ?? null,
    step_index: decision.selected_sequence_step ?? 0,
    channel: 'email',
    status: 'pending',
    // NO subject or body. The engine generates from the composite context at
    // send time, which is what routes it through the validator and the fact
    // guard. Pre-rendering copy here would bypass both.
    //
    // The STAGGERED slot, not `now`. Queueing everything at the run time made
    // every message eligible the instant the send window opened, which is a
    // burst at 8am competing with every other campaign that also starts then.
    // The slot is computed the night before and spread across the day.
    scheduled_for: sendAt ?? now,
    max_attempts: 1,
    attempts_made: 0,
    metadata: {
      source: 'explorer_growth_os',
      explorer_decision_id: decision.id,
    },
  } as never);

  // Mark executed ONLY after the row exists. The reverse order would leave a
  // decision claiming an email that was never queued, and nothing would retry it.
  await ExplorerJourneyDecision.update(
    { executed: true, scheduled_email_id: (scheduled as { id: string }).id } as never,
    { where: { id: decision.id } },
  );

  result.queued += 1;
}

/**
 * Flag-gated entry point for the cron.
 *
 * Read through `isExplorerFeatureEnabled` so BOTH the master switch and
 * `execution` must be on — a direct sub-flag read would let this run with the
 * master off, and a guard test scans backend source for exactly that.
 */
export async function runExplorerExecution(now: Date = new Date()): Promise<ExecutionResult | { skipped: true }> {
  if (!isExplorerFeatureEnabled('execution', env.explorerGrowth)) {
    return { skipped: true };
  }

  const result = emptyResult();

  const pending = await ExplorerJourneyDecision.findAll({
    where: {
      executed: false,
      selected_action: 'SEND_EMAIL',
      created_at: { [Op.gte]: new Date(now.getTime() - DECISION_FRESHNESS_HOURS * 3_600_000) },
    } as never,
    order: [['created_at', 'ASC']],
  });

  // Plan the day's shape before queueing anything.
  //
  // Settings are read ONCE per run rather than per decision: an operator
  // editing the window while this is running should not produce a schedule
  // built half from the old values and half from the new.
  //
  // A settings failure falls back to the documented defaults rather than
  // aborting. The alternative is that a bad row in `system_settings` silently
  // stops all Explorer sending, which is a worse failure than sending on the
  // default cadence.
  let config = STAGGER_DEFAULTS;
  try {
    config = resolveStaggerConfig(await getAllSettings());
  } catch (err: unknown) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        service: 'explorer-growth',
        event: 'explorer_stagger_settings_unreadable',
        outcome: 'partial',
        note: 'falling back to defaults',
        message: String((err as { message?: string })?.message ?? '').slice(0, 200),
      }),
    );
  }

  const windowOpen = nextWindowOpen(now, config, EXPLORER_SEND_TIMEZONE);
  const plan = planStagger(pending.length, windowOpen, config);

  result.deferredToNextDay = plan.deferred;
  result.gapMinutes = plan.gapMinutes;
  result.firstSendAt = plan.slots[0]?.toISOString();
  result.lastSendAt = plan.slots[plan.slots.length - 1]?.toISOString();

  // Anything past the plan's capacity is simply not touched: left unexecuted so
  // the next night picks it up. Compressing the gap to fit would reintroduce the
  // burst, and marking them done would lose them.
  const schedulable = pending.slice(0, plan.slots.length);

  for (let i = 0; i < schedulable.length; i++) {
    const row = schedulable[i];
    try {
      await executeDecision(row as never, now, result, plan.slots[i]);
    } catch (err: unknown) {
      // One bad decision must not stop the batch, and it must not be silently
      // marked executed either — it stays pending and is retried next run.
      note(result, 'error');
      console.error(
        redactForLogs(
          JSON.stringify({
            level: 'error',
            service: 'explorer-growth',
            event: 'explorer_execution_failed',
            error_class: 'ExecutionError',
            outcome: 'failure',
            decision_id: (row as { id?: string }).id ?? null,
            message: String((err as { message?: string })?.message ?? '').slice(0, 200),
          }),
        ),
      );
    }
  }

  console.log(
    JSON.stringify({
      level: 'info',
      service: 'explorer-growth',
      event: 'explorer_execution_run',
      outcome: result.reasons.error ? 'partial' : 'success',
      ...result,
    }),
  );

  return result;
}
