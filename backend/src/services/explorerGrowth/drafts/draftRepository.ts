import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { SequenceStep } from '../../../models/FollowUpSequence';
import {
  EXPLORER_DRAFT_STATUS,
  SENDER_CLAIMED_STATUS,
  type DraftMessage,
  type DraftableDecision,
  type PersistDraftInput,
} from './draftContracts';

/**
 * Explorer Growth OS — the database half of the draft stage.
 *
 * Every function here is one query with one job, so `renderDecisionDraft` stays
 * pure enough to unit-test and this file stays the only place a draft touches
 * Postgres.
 */

/**
 * The campaign's sequence steps, in order.
 *
 * `campaigns.sequence_id -> follow_up_sequences.steps` (jsonb), the same join
 * `contextGraphService.ts:104-110` uses. A LEFT JOIN on purpose: a campaign
 * with no sequence yields `[]`, which the caller reports as
 * `no_sequence_steps` rather than mistaking for step 0 of something.
 */
export async function loadSequenceSteps(campaignId: string): Promise<SequenceStep[]> {
  const rows = await sequelize.query<{ steps: SequenceStep[] | string | null }>(
    `SELECT fs.steps
       FROM campaigns c
       LEFT JOIN follow_up_sequences fs ON fs.id = c.sequence_id
      WHERE c.id = :campaignId`,
    { replacements: { campaignId }, type: QueryTypes.SELECT },
  );
  const raw = rows[0]?.steps;
  if (!raw) return [];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * How many EARLIER decisions for this learner on this campaign already carry a
 * draft. This is the sequence position; see `selectStepIndex`.
 *
 * `decision_date < :before` is the load-bearing part. Counting drafts up to and
 * including today would advance the step index every time the job re-ran,
 * turning a replay into a different message.
 */
export async function countPriorDrafted(
  enrollmentId: string,
  campaignId: string,
  before: string,
): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM explorer_journey_decisions
      WHERE enrollment_id = :enrollmentId
        AND selected_campaign_id = :campaignId
        AND decision_date < :before
        AND scheduled_email_id IS NOT NULL`,
    { replacements: { enrollmentId, campaignId, before }, type: QueryTypes.SELECT },
  );
  return Number(rows[0]?.n ?? 0);
}

export async function loadRecipientEmail(leadId: number): Promise<string | null> {
  const rows = await sequelize.query<{ email: string | null }>(
    `SELECT email FROM leads WHERE id = :leadId`,
    { replacements: { leadId }, type: QueryTypes.SELECT },
  );
  const email = rows[0]?.email;
  return email && email.trim() ? email.trim() : null;
}

/**
 * Every decision for one date, in the narrow shape the draft stage reads.
 *
 * Not filtered to `selected_action = 'SEND_EMAIL'` in SQL on purpose. The run
 * report has to be able to say "47 of 153 were WAIT" — filtering here would
 * make those rows invisible and the report would read as though the Governor
 * had decided nothing for them.
 */
export async function loadDecisionsForDate(
  decisionDate: string,
  limit?: number,
): Promise<DraftableDecision[]> {
  return sequelize.query<DraftableDecision>(
    `SELECT id::text AS id,
            enrollment_id::text AS enrollment_id,
            lead_id,
            decision_date::text AS decision_date,
            selected_action,
            selected_campaign_id::text AS selected_campaign_id,
            channel,
            scheduled_email_id::text AS scheduled_email_id,
            COALESCE(selected_content_assets, '[]'::jsonb) AS selected_content_assets,
            reason
       FROM explorer_journey_decisions
      WHERE decision_date = :decisionDate
      ORDER BY created_at ASC
      ${limit ? 'LIMIT :limit' : ''}`,
    {
      replacements: limit ? { decisionDate, limit } : { decisionDate },
      type: QueryTypes.SELECT,
    },
  );
}

/**
 * Read one rendered draft back, for the Why drilldown.
 *
 * Returns null rather than throwing on a missing row: a decision can carry a
 * `scheduled_email_id` whose draft was later deleted, and the drilldown's job
 * is to state that absence, not to 500 on it.
 */
export async function loadDraftForDecision(
  scheduledEmailId: string,
): Promise<DraftMessage | null> {
  const rows = await sequelize.query<{
    id: string;
    subject: string;
    body: string;
    status: string;
    step_index: number | null;
    metadata: Record<string, any> | string | null;
    created_at: Date | null;
  }>(
    `SELECT id::text AS id, subject, body, status, step_index, metadata, created_at
       FROM scheduled_emails
      WHERE id = CAST(:scheduledEmailId AS uuid)`,
    { replacements: { scheduledEmailId }, type: QueryTypes.SELECT },
  );
  const row = rows[0];
  if (!row) return null;

  const meta =
    (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) ?? {};
  const gate = meta.quality_gate ?? {};

  return {
    scheduled_email_id: row.id,
    subject: row.subject,
    body: row.body,
    status: row.status,
    // Derived from the STATUS, not from the metadata flag. The status is what
    // the rest of the system keys on, so a disagreement between the two must
    // resolve the same way everywhere, and the status is the authority.
    passed_quality_gate: row.status === EXPLORER_DRAFT_STATUS,
    issues: Array.isArray(gate.issues) ? gate.issues : [],
    auto_fixed: Array.isArray(gate.auto_fixed) ? gate.auto_fixed : [],
    fact_set_present: gate.fact_set_present === true,
    step_index: row.step_index ?? null,
    model: typeof meta.model === 'string' ? meta.model : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Write the draft and stamp the decision in ONE transaction.
 *
 * ATOMIC BECAUSE A PARTIAL COMMIT BREAKS IDEMPOTENCY, not for tidiness. The
 * replay guard is `decision.scheduled_email_id IS NOT NULL`; if the insert
 * committed and the update did not, tomorrow's run would see an unstamped
 * decision and generate a second draft for it. CLAUDE.md's idempotency rule
 * calls that a production defect, and it is the exact failure mode it names.
 *
 * `scheduled_for` is NOT NULL on the table so it must hold something, and
 * nothing ever reads it here: the sender's candidate SELECT and its claiming
 * UPDATE both require `status = 'pending'` (`schedulerService.ts:456,482`), and
 * these rows are never pending. The stale-pending expiry job is likewise
 * scoped to `status = 'pending'` (`:414`), so it cannot touch a draft either.
 */
export async function commitDraft(input: PersistDraftInput, decisionId: string): Promise<string> {
  // Belt-and-braces against the one mistake that would make a draft sendable.
  //
  // COMPARED AS A PLAIN STRING DELIBERATELY. `PersistDraftInput.status` already
  // excludes 'pending', so TypeScript correctly reports the narrow comparison
  // as unreachable (TS2367) — and that is the argument FOR keeping it rather
  // than against. The guard is not there for today's type; it is there for the
  // day someone widens that union, which is exactly when the type stops
  // helping and this check starts. One string compare per draft.
  if ((input.status as string) === SENDER_CLAIMED_STATUS) {
    throw new Error(`refusing to write a draft with the sender-claimed status "${input.status}"`);
  }

  return sequelize.transaction(async (t) => {
    const inserted = await sequelize.query<{ id: string }>(
      `INSERT INTO scheduled_emails
         (lead_id, campaign_id, step_index, channel, subject, body, to_email,
          max_attempts, attempts_made, scheduled_for, status, ai_instructions,
          ai_generated, metadata, created_at)
       VALUES
         (:lead_id, :campaign_id, :step_index, 'email', :subject, :body, :to_email,
          1, 0, NOW(), :status, :ai_instructions,
          true, CAST(:metadata AS jsonb), NOW())
       RETURNING id::text AS id`,
      {
        replacements: {
          lead_id: input.lead_id,
          campaign_id: input.campaign_id,
          step_index: input.step_index,
          subject: input.subject.slice(0, 255),
          body: input.body,
          to_email: input.to_email,
          status: input.status,
          ai_instructions: input.ai_instructions,
          metadata: JSON.stringify(input.metadata),
        },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );

    const id = inserted[0]?.id;
    if (!id) throw new Error('draft insert returned no id');

    await sequelize.query(
      `UPDATE explorer_journey_decisions
          SET scheduled_email_id = CAST(:id AS uuid),
              selected_sequence_step = :stepIndex
        WHERE id = CAST(:decisionId AS uuid)`,
      {
        replacements: { id, stepIndex: input.step_index, decisionId },
        transaction: t,
      },
    );

    return id;
  });
}
