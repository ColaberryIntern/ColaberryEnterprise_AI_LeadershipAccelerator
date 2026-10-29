import type { ExplorerActionType } from '../../../types/explorerGrowth';
// Type-only, so this file stays free of runtime imports. The citation shape is the quote
// gate's, not a second copy of it: a reviewer comparing a draft against the hub needs the
// same `reference` the gate approved, not a re-derived link.
import type { KnowledgeCitation } from '../explorerKnowledgeQuote';

/**
 * Explorer Growth OS — draft render contracts. Phase 1 of
 * `docs/EXPLORER_MESSAGING_PLAN.html`.
 *
 * ── WHY THIS STAGE EXISTS ───────────────────────────────────────────────────
 *
 * All 24 Explorer sequence steps ship a real `subject` and a real prose
 * `ai_instructions` brief with `body_template: ''` ON PURPOSE — the body was
 * deferred to send time (`seeds/explorerGrowth/explorerSequenceDefinitions.ts`,
 * the docblock at the top). Send time has never arrived, so no Explorer message
 * body has ever existed, for anybody.
 *
 * The consequence is the one Ali hit on 2026-10-27: shadow mode can show which
 * action was chosen and which lesson could be cited, and nothing at all about
 * what the learner would actually read. "I don't understand how we get any
 * weekly digest out of this" is the correct reading of the system — the digest
 * is a fully-specified prompt that has never been run.
 *
 * This stage runs the prompt and persists the result, so a shadow decision
 * carries the message it would have produced.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * It does not send, enqueue, or make anything sendable. Drafts are written to
 * `scheduled_emails` with the statuses below, and the sender claims ONLY
 * `status = 'pending'` — verified at `schedulerService.ts:456` (candidate
 * SELECT) and `:482` (the claiming UPDATE, whose `AND status = 'pending'`
 * predicate is the actual lock). A row in any other status cannot be claimed,
 * so it cannot be sent. That is a structural property of the sender, not a
 * convention this file is trusting.
 *
 * ── WHY IT IS A SEPARATE PASS, NOT PART OF THE GOVERNOR ─────────────────────
 *
 * `governor/__tests__/noSendPaths.test.ts` holds the Governor to an import
 * WHITELIST and forbids `sequenceService`, `schedulerService` and
 * `emailService` outright. That guard is correct and should stay: a decision
 * engine that can compose and enqueue copy is one refactor away from sending.
 *
 * So this reads decisions back out of `explorer_journey_decisions` after the
 * Governor has written them. Three things fall out of that, all of them wanted:
 * the Governor stays pure; re-running is idempotent because a decision that
 * already carries a `scheduled_email_id` is skipped; and drafts for a past date
 * can be re-rendered without re-deciding anything.
 */

/**
 * Generated, validated, and unsendable.
 *
 * NOT `agent_draft`. That status is Maya's correspondence and has its own
 * review surface (`agents/tools/agentEmailInboxService.ts`); Explorer journey
 * drafts appearing in an agent's mailbox would be two unrelated queues sharing
 * one name. Both are equally unsendable — neither is `pending`.
 */
export const EXPLORER_DRAFT_STATUS = 'explorer_draft';

/**
 * Generated and REFUSED by the send-time quality gate, kept anyway.
 *
 * Discarding these would reproduce the exact problem this phase exists to fix:
 * a reviewer would see a decision with no message and no way to tell whether
 * the generator failed, the gate refused it, or nothing ever ran. The copy and
 * the refusal reasons are both persisted so the answer is on the row.
 *
 * Most common cause, and it is the system working rather than failing: the
 * Explorer fact set is empty (no open future cohort), so any date, price or
 * seat count in the copy is ungrounded and `explorerFactGuard` rejects it.
 */
export const EXPLORER_DRAFT_REJECTED_STATUS = 'explorer_draft_rejected';

/**
 * A draft that a regeneration replaced. Kept, never deleted.
 *
 * THE VERSION HISTORY IS THESE ROWS. `commitDraft` already inserts a new row and re-points
 * the decision at it, so a regeneration would leave the old row behind anyway - orphaned,
 * still carrying `explorer_draft`, and therefore indistinguishable from the current one. All
 * that was missing was a word for "this was the previous answer". With it, the history of a
 * decision is `SELECT ... WHERE metadata->>'explorer_decision_id' = :id ORDER BY created_at`,
 * at full fidelity: subject, body, gate verdict, citations, model and token count, exactly as
 * they were. A separate history table would have duplicated all of those columns and then
 * had to be kept in step with them.
 *
 * Only reachable because `scheduled_emails.status` is now 32 wide: at 25 characters this
 * value could not have been written at all against the old `VARCHAR(20)`, which is the same
 * defect `ensureScheduledEmailStatusWidth` exists to fix for the rejected status.
 *
 * Unsendable for the same structural reason as the other two: it is not `pending`.
 */
export const EXPLORER_DRAFT_SUPERSEDED_STATUS = 'explorer_draft_superseded';

/** No draft status may ever equal the one the sender claims. */
export const SENDER_CLAIMED_STATUS = 'pending';

/**
 * One entry in a decision's draft history, oldest first.
 *
 * An intersection rather than a new shape: a version IS a draft, and a reviewer comparing
 * two of them needs the same fields on both. Duplicating a narrowed "summary" shape here is
 * how a history view ends up unable to show the thing someone opened it to compare.
 */
export type DraftVersion = DraftMessage & {
  /** 1-based, oldest first, assigned at read time from `created_at` order. */
  version: number;
  /** True when a later regeneration replaced this one. */
  superseded: boolean;
  /** True for the version the decision currently points at. */
  current: boolean;
};

/**
 * Actions that mean "an email would have gone out".
 *
 * DERIVED FROM THE GENERATORS, not from the action names. Every entry here is
 * emitted by `governor/candidates/` with BOTH a `campaign_key` and
 * `channel: 'email'`, which together are what make a decision renderable: the
 * campaign supplies the sequence, and the sequence supplies the brief.
 *
 *   SEND_EMAIL        activationRescue:69, highIntent:44, nurture:63,83,104
 *   RECOMMEND_LESSON  nurture.ts:41  — tier 7, campaign explorer_next_lesson
 *   RECOVER_FRICTION  frictionRecovery.ts:61 — tier 2, explorer_friction_recovery
 *
 * THE TWO NON-OBVIOUS ONES ARE THE POINT. `RECOMMEND_LESSON` and
 * `RECOVER_FRICTION` are named after what the email is ABOUT, not after a
 * channel, and both bail out unless the learner is email-eligible. A first
 * version of this list read `['SEND_EMAIL']` on the strength of the names
 * alone, which would have skipped the whole of tier 7 — the personalised
 * learning tier that fires for ACTIVE_LEARNER, ENGAGED_LEARNER and
 * CONNECTED_TO_COMMUNITY, the largest group there is. The run would have
 * reported a tidy `action_not_draftable` for most of the cohort and looked
 * like it was working.
 *
 * `SHOW_IN_APP_NUDGE` and `CREATE_HUMAN_TASK` are absent because they are not
 * email — `CREATE_HUMAN_TASK` carries `channel: 'none'`.
 *
 * `SEND_ALI_OUTREACH` is absent on purpose, and this one IS a judgement rather
 * than a fact: it is email, but it is personal correspondence from Ali's own
 * campaign identity, and drafting it under the generic Colaberry persona would
 * put words in a named human's mouth. It gets its own treatment or none.
 */
export const DRAFTABLE_ACTIONS: readonly ExplorerActionType[] = [
  'SEND_EMAIL',
  'RECOMMEND_LESSON',
  'RECOVER_FRICTION',
];

/** Why a decision got no draft. Every one is reported, never swallowed. */
export type DraftSkipReason =
  | 'flag_off'
  | 'already_drafted'
  | 'action_not_draftable'
  | 'channel_not_email'
  | 'no_lead_id'
  | 'no_campaign'
  | 'no_sequence_steps'
  | 'no_recipient_email'
  | 'cap_reached'
  | 'generation_failed';

/** One decision's outcome. `drafted` and `rejected` both persisted a row. */
export interface DraftOutcome {
  decision_id: string;
  enrollment_id: string;
  status: 'drafted' | 'rejected' | 'skipped' | 'failed';
  reason: DraftSkipReason | null;
  scheduled_email_id: string | null;
  step_index: number | null;
  /** Quality-gate issues when `rejected`; the error class when `failed`. */
  issues: string[];
  /**
   * On a regeneration, the draft this one replaced.
   *
   * `null` on a first draft, and also `null` when the supersede matched nothing - which is
   * the honest answer to a double-submitted regeneration, where a previous attempt already
   * superseded that row. A caller must not read `null` here as "the old draft is still
   * current".
   */
  superseded_scheduled_email_id?: string | null;
}

export interface DraftRenderResult {
  attempted: number;
  drafted: number;
  rejected: number;
  skipped: number;
  failed: number;
  /** Counts keyed by skip reason, so a run reports WHICH wall it hit. */
  by_reason: Record<string, number>;
  outcomes: DraftOutcome[];
}

/** The decision fields this stage reads. Narrow on purpose. */
export interface DraftableDecision {
  id: string;
  enrollment_id: string;
  lead_id: number | null;
  decision_date: string;
  selected_action: ExplorerActionType | null;
  selected_campaign_id: string | null;
  channel: string | null;
  scheduled_email_id: string | null;
  selected_content_assets: Record<string, any>[];
  reason: string;
}

/**
 * A rendered draft, read back for display.
 *
 * WHY THE REFUSAL TRAVELS WITH THE COPY. A reviewer looking at a draft needs to
 * know whether they are reading something shippable or something the quality
 * gate threw out, and the difference is invisible in the prose itself. Showing
 * the body without the verdict would be worse than showing nothing: it would
 * look approved.
 */
export interface DraftMessage {
  scheduled_email_id: string;
  subject: string;
  body: string;
  /** `explorer_draft` or `explorer_draft_rejected`. Never a sendable status. */
  status: string;
  /** True when the send-time quality gate passed this copy. */
  passed_quality_gate: boolean;
  /** Why the gate refused, verbatim. Empty when it passed. */
  issues: string[];
  /** What the validator silently corrected. Empty when it changed nothing. */
  auto_fixed: string[];
  /**
   * False means the Explorer fact guard was NOT in force for this generation,
   * so dates and prices in the copy went unchecked. Distinct from "in force and
   * found nothing quotable", which is the strictest state rather than the
   * weakest — conflating them makes a disabled guard look like a passing one.
   */
  fact_set_present: boolean;
  step_index: number | null;
  model: string | null;
  created_at: string | null;
  /**
   * The knowledge entries this copy was allowed to draw on, in prompt order.
   *
   * Empty is AMBIGUOUS on its own, which is why `knowledge_available` sits beside it: the
   * corpus may have failed to load, or it may have loaded and offered nothing quotable.
   * Those have different fixes — a deployment problem versus a content problem — and a
   * reviewer looking at a thin draft needs to know which.
   */
  cited: KnowledgeCitation[];
  /** False when the knowledge base could not be read at all for this generation. */
  knowledge_available: boolean;
  /**
   * The identity and published voice the copy was written under.
   *
   * `published: false` means rule-set version 0 — nobody has written a voice down for this
   * brand — which is not the same as a brand whose voice says nothing. Null only for a
   * draft rendered before brand voice was recorded.
   */
  brand_voice: { name: string; rules_version: number; published: boolean } | null;
}

/** What gets written to `scheduled_emails`. */
export interface PersistDraftInput {
  lead_id: number;
  campaign_id: string;
  step_index: number;
  subject: string;
  body: string;
  to_email: string;
  ai_instructions: string;
  status: typeof EXPLORER_DRAFT_STATUS | typeof EXPLORER_DRAFT_REJECTED_STATUS;
  metadata: Record<string, any>;
}
