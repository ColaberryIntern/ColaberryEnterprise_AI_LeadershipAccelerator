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

export interface ExecutionResult {
  attempted: number;
  queued: number;
  skipped: number;
  reasons: Record<string, number>;
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
    scheduled_for: now,
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

  for (const row of pending) {
    try {
      await executeDecision(row as never, now, result);
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
