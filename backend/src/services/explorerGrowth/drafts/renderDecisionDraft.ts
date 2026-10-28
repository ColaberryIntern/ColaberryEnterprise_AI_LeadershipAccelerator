import type { SequenceStep } from '../../../models/FollowUpSequence';
import type { CompositeContext } from '../../contextGraphService';
import type { GenerateMessageParams, GenerateMessageResult } from '../../aiMessageService';
import type { ValidationResult } from '../../messageValidatorService';
import {
  EXPLORER_DRAFT_REJECTED_STATUS,
  EXPLORER_DRAFT_STATUS,
  type DraftOutcome,
  type DraftableDecision,
  type PersistDraftInput,
} from './draftContracts';
import { draftSkipReason, selectStepIndex } from './draftEligibility';

/**
 * Explorer Growth OS — render ONE decision into a draft.
 *
 * Dependencies are injected rather than imported, the same way
 * `decideForLearner` takes `policyInputFor`. It keeps this file's logic
 * testable without a database, an OpenAI key, or a Governor run — and the
 * tests that matter here are about what happens when generation fails or the
 * quality gate refuses, which are awkward to provoke through real I/O.
 */

export interface DraftRenderDeps {
  /** The campaign's sequence steps, in order. Empty when it has no sequence. */
  loadSequenceSteps: (campaignId: string) => Promise<SequenceStep[]>;
  /** Decisions STRICTLY EARLIER than this one already carrying a draft. */
  countPriorDrafted: (enrollmentId: string, campaignId: string, before: string) => Promise<number>;
  loadRecipientEmail: (leadId: number) => Promise<string | null>;
  buildContext: (leadId: number, campaignId: string, stepIndex: number) => Promise<CompositeContext>;
  generate: (params: GenerateMessageParams) => Promise<GenerateMessageResult>;
  validate: (content: string, context: CompositeContext, channel: 'email') => ValidationResult;
  /**
   * Write the draft AND stamp the decision's `scheduled_email_id` /
   * `selected_sequence_step`, ATOMICALLY. Returns the new draft's id.
   *
   * ONE DEPENDENCY RATHER THAN TWO, DELIBERATELY. Writing the draft and
   * linking the decision as separate steps leaves a window in which a crash
   * persists a draft that no decision points at — and because the idempotency
   * guard is `decision.scheduled_email_id IS NOT NULL`, the next run would
   * happily generate a second one. Making it a single call means the type
   * itself forbids the partial commit rather than a comment asking for it.
   */
  commitDraft: (input: PersistDraftInput, decisionId: string) => Promise<string>;
}

/** A skip, phrased as an outcome so the batch never has to special-case it. */
function skipped(
  decision: DraftableDecision,
  reason: NonNullable<DraftOutcome['reason']>,
): DraftOutcome {
  return {
    decision_id: decision.id,
    enrollment_id: decision.enrollment_id,
    status: 'skipped',
    reason,
    scheduled_email_id: null,
    step_index: null,
    issues: [],
  };
}

/**
 * Put the resolved lesson cards in front of the generator.
 *
 * THIS IS THE WHOLE POINT OF THE DIGEST. Its brief says "Lead with the content
 * supplied in the context — usually two or three lessons — and say what each is
 * FOR in one line". Nothing has ever supplied that context, so the brief has
 * been asking the model to lead with something it was never given.
 *
 * It is appended to `ai_instructions` rather than passed as `context_notes`
 * because `buildUserPrompt` returns early when a composite context is present
 * (`aiMessageService.ts:206`) and never reads `context_notes` on that path. A
 * field that is silently ignored would look like grounding and provide none.
 *
 * Titles and summaries only — the registry holds POINTERS, never copy, and a
 * card carries no body to quote.
 */
export function describeContentAssets(assets: ReadonlyArray<Record<string, any>>): string {
  if (!assets?.length) return '';
  const lines = assets
    .map((a) => {
      const title = a?.title ?? a?.name;
      if (!title) return null;
      const summary = a?.summary ?? a?.description ?? '';
      const url = a?.url ?? a?.portal_url ?? '';
      return `- ${title}${summary ? `: ${summary}` : ''}${url ? ` (${url})` : ''}`;
    })
    .filter(Boolean);
  if (!lines.length) return '';
  return [
    '',
    'CONTENT SUPPLIED FOR THIS MESSAGE (reference these and nothing else;',
    'do not invent a lesson, a module, or a title that is not listed here):',
    ...lines,
  ].join('\n');
}

/** Everything needed to render, or the reason there is nothing to render. */
export type DraftPlan =
  | {
      ok: true;
      leadId: number;
      campaignId: string;
      stepIndex: number;
      step: SequenceStep;
      toEmail: string;
      totalSteps: number;
    }
  | { ok: false; reason: NonNullable<DraftOutcome['reason']> };

/** The read-only half of the deps — enough to plan, not enough to spend money. */
export type DraftPlanDeps = Pick<
  DraftRenderDeps,
  'loadSequenceSteps' | 'countPriorDrafted' | 'loadRecipientEmail'
>;

/**
 * Resolve everything a draft needs, WITHOUT generating anything.
 *
 * Split out so `--dry-run` can report the real distribution — which learners
 * would get a draft and precisely which wall the rest hit — at the cost of a
 * few cheap reads and no model calls. A dry run that reported "would draft
 * 106" and was then followed by a real run that drafted 44 because most
 * learners have no email on file would be worse than no dry run at all.
 */
export async function planDecisionDraft(
  decision: DraftableDecision,
  deps: DraftPlanDeps,
): Promise<DraftPlan> {
  const preReason = draftSkipReason(decision);
  if (preReason) return { ok: false, reason: preReason };

  // Narrowed by draftSkipReason above; asserted so the types follow.
  const leadId = decision.lead_id as number;
  const campaignId = decision.selected_campaign_id as string;

  const steps = await deps.loadSequenceSteps(campaignId);
  const stepIndex = selectStepIndex(
    await deps.countPriorDrafted(decision.enrollment_id, campaignId, decision.decision_date),
    steps.length,
  );
  if (stepIndex === null) return { ok: false, reason: 'no_sequence_steps' };

  const toEmail = await deps.loadRecipientEmail(leadId);
  if (!toEmail) return { ok: false, reason: 'no_recipient_email' };

  return {
    ok: true,
    leadId,
    campaignId,
    stepIndex,
    step: steps[stepIndex],
    toEmail,
    totalSteps: steps.length,
  };
}

/**
 * Generate, check, persist, link.
 *
 * Returns rather than throws for every expected condition. A batch of 150 must
 * not lose 149 drafts because one learner has no lead row.
 */
export async function renderDecisionDraft(
  decision: DraftableDecision,
  deps: DraftRenderDeps,
): Promise<DraftOutcome> {
  const plan = await planDecisionDraft(decision, deps);
  if (!plan.ok) return skipped(decision, plan.reason);
  const { leadId, campaignId, stepIndex, step, toEmail, totalSteps } = plan;

  const instructions = `${step.ai_instructions ?? ''}${describeContentAssets(
    decision.selected_content_assets ?? [],
  )}`;

  let generated: GenerateMessageResult;
  let context: CompositeContext;
  try {
    context = await deps.buildContext(leadId, campaignId, stepIndex);
    generated = await deps.generate({
      channel: 'email',
      ai_instructions: instructions,
      lead: {
        name: context.lead.name,
        company: context.lead.company,
        title: context.lead.title,
        industry: context.lead.industry,
        email: context.lead.email,
      },
      campaignContext: {
        type: context.campaign.type,
        name: context.campaign.name,
        step_goal: step.step_goal ?? context.campaign.stepGoal,
        step_number: stepIndex + 1,
        total_steps: totalSteps,
      },
      tone: step.ai_tone,
      compositeContext: context,
    });
  } catch (err: any) {
    return {
      decision_id: decision.id,
      enrollment_id: decision.enrollment_id,
      status: 'failed',
      reason: 'generation_failed',
      scheduled_email_id: null,
      step_index: stepIndex,
      issues: [err?.name || 'GenerationError', err?.message ?? 'unknown'].filter(Boolean),
    };
  }

  // RE-VALIDATED HERE, AND THIS IS NOT REDUNDANT. `generateMessage` already
  // calls `validateGeneratedMessage` internally when a composite context is
  // present (`aiMessageService.ts:338`), but it keeps ONLY `validation.content`
  // — the auto-fixed text — and discards `valid` and `issues`. So a genuine
  // refusal, such as an ungrounded cohort date that the Explorer fact guard
  // cannot auto-fix, comes back looking like clean copy.
  //
  // That internal call does the fixing. This one reads the verdict. Trusting
  // the first would persist laundered copy as though it had passed, which is
  // precisely the kind of guard-that-cannot-fire this subsystem has shipped
  // three of already.
  const verdict = deps.validate(generated.body, context, 'email');

  const status = verdict.valid ? EXPLORER_DRAFT_STATUS : EXPLORER_DRAFT_REJECTED_STATUS;
  const scheduledEmailId = await deps.commitDraft(
    {
      lead_id: leadId,
      campaign_id: campaignId,
      step_index: stepIndex,
      // The seeded subject is real copy and is the fallback when the model
      // returns none — `explorerSequenceDefinitions.ts` writes a genuine
      // subject on all 24 steps even though every body_template is empty.
      subject: generated.subject || step.subject || 'Colaberry Enterprise AI',
      body: verdict.content,
      to_email: toEmail,
      ai_instructions: instructions,
      status,
      metadata: {
        explorer_decision_id: decision.id,
        explorer_enrollment_id: decision.enrollment_id,
        explorer_decision_date: decision.decision_date,
        explorer_step_index: stepIndex,
        quality_gate: {
          valid: verdict.valid,
          issues: verdict.issues,
          auto_fixed: verdict.autoFixed,
          // Absent means this was not treated as an Explorer send and the
          // fact guard did not apply. Empty means it WAS and nothing may be
          // quoted, which is the strictest state, not the most permissive.
          fact_set_present: context.explorer !== undefined,
        },
        model: generated.model,
        tokens_used: generated.tokens_used,
      },
    },
    decision.id,
  );

  return {
    decision_id: decision.id,
    enrollment_id: decision.enrollment_id,
    status: verdict.valid ? 'drafted' : 'rejected',
    reason: null,
    scheduled_email_id: scheduledEmailId,
    step_index: stepIndex,
    issues: verdict.issues,
  };
}
