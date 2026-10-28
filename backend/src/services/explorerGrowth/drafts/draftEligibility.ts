import { DRAFTABLE_ACTIONS, type DraftSkipReason, type DraftableDecision } from './draftContracts';

/**
 * Explorer Growth OS — who gets a draft, and which sequence step it renders.
 *
 * PURE. No database, no network, no clock. Everything here is decidable from a
 * decision row plus two counts, which is what makes the rules testable without
 * standing up a Governor run.
 */

/** Null means eligible. A string names the wall it hit. */
export function draftSkipReason(decision: DraftableDecision): DraftSkipReason | null {
  // Order matters only for which reason gets REPORTED, and the order is chosen
  // so the reported reason is the most actionable one. `already_drafted` goes
  // first because it is the idempotency guard and is not a defect at all.
  if (decision.scheduled_email_id) return 'already_drafted';
  if (!decision.selected_action) return 'action_not_draftable';
  if (!DRAFTABLE_ACTIONS.includes(decision.selected_action)) return 'action_not_draftable';

  // A SEND_EMAIL whose channel says otherwise is a contradiction in the row.
  // Reported rather than resolved: silently trusting one field over the other
  // would hide a Governor bug behind a plausible-looking draft.
  if (decision.channel !== 'email') return 'channel_not_email';

  // `scheduled_emails.lead_id` is INTEGER NOT NULL with an FK to `leads`
  // (`models/ScheduledEmail.ts:67-71`), so a learner with no lead row cannot
  // have a draft. Named, not crashed on — an Explorer without a lead_id is a
  // real and expected state, and the insert would otherwise fail per row.
  if (decision.lead_id === null || decision.lead_id === undefined) return 'no_lead_id';

  // The Governor leaves this null AND names the gap when a campaign_key has no
  // campaign behind it (`runGovernor.ts:242-248`). Without a campaign there is
  // no sequence, so there is no brief to render from.
  if (!decision.selected_campaign_id) return 'no_campaign';

  return null;
}

/**
 * Which step of the campaign's sequence this draft renders.
 *
 * `selected_sequence_step` has never been written by anything. The Governor
 * tracks no sequence position — it picks an ACTION and a CAMPAIGN each night,
 * not a place in a ladder — so the position has to be derived, and the honest
 * derivation is "how many times has this learner already been drafted into this
 * campaign".
 *
 * WHY THAT IS IDEMPOTENT. `priorDrafted` counts decisions STRICTLY EARLIER than
 * this one that already carry a `scheduled_email_id`. It cannot count the row
 * being rendered, so re-running a date yields the same index. Counting "drafts
 * so far" instead would advance the step on every re-run, which is the classic
 * works-once-breaks-on-replay defect.
 *
 * WHY IT CLAMPS RATHER THAN WRAPS. A learner who stays in the nurture campaign
 * past its last step keeps receiving the last step's brief. Wrapping to step 0
 * would restart a sequence that opens by introducing itself to someone who has
 * had eight messages from it.
 *
 * Returns null when the campaign has no steps, which the caller reports as
 * `no_sequence_steps` rather than defaulting to 0 — a campaign with an empty
 * sequence has no brief, and rendering step 0 of nothing would invent one.
 */
export function selectStepIndex(priorDrafted: number, totalSteps: number): number | null {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return null;
  const prior = Number.isFinite(priorDrafted) && priorDrafted > 0 ? Math.floor(priorDrafted) : 0;
  return Math.min(prior, totalSteps - 1);
}

/**
 * Tally reasons for the run report.
 *
 * Counted by NAME, never just summed. "47 skipped" tells a reviewer nothing;
 * "47 skipped: 44 no_lead_id, 3 no_campaign" tells them exactly which of the
 * two completely different problems to go and fix. Same discipline as the
 * Governor naming its asset gaps rather than counting them.
 */
export function tallyReasons(reasons: ReadonlyArray<DraftSkipReason | null>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reasons) {
    if (!r) continue;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}
