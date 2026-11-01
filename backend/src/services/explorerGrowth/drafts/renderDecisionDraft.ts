import { env } from '../../../config/env';
import type { SequenceStep } from '../../../models/FollowUpSequence';
import type { CompositeContext } from '../../contextGraphService';
import type {
  BrandVoice,
  GenerateMessageParams,
  GenerateMessageResult,
} from '../../aiMessageService';
import type { ValidationResult } from '../../messageValidatorService';
import type { ExplorerFactSet } from '../explorerFactGuard';
import type { GroundingResult } from '../explorerKnowledgeGrounding';
import {
  EXPLORER_DRAFT_REJECTED_STATUS,
  EXPLORER_DRAFT_STATUS,
  type DraftOutcome,
  type DraftableDecision,
  type PersistDraftInput,
} from './draftContracts';
import {
  absolutizeHref,
  absolutizeHrefs,
  bannedCopyInstruction,
  bannedCopyIssues,
  emailLinkIssues,
  isSafeToAdvertise,
} from './draftCopyGuards';
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

/**
 * What the knowledge base offered for one message.
 *
 * A discriminated union rather than `GroundingResult | null`, so "the corpus could not be
 * loaded" and "the corpus loaded and offered nothing quotable" stay distinguishable on the
 * persisted row. Those have different fixes - one is a deployment problem, the other a
 * content problem - and collapsing them is the same mistake `fact_set_present` exists to
 * prevent for the fact guard.
 */
export type DraftGrounding =
  | { available: true; result: GroundingResult }
  | { available: false; reason: string };

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
   * Knowledge for this message: gate the corpus, rank what survives, render a prompt block.
   *
   * REQUIRED, not optional. An optional dependency defaults to doing nothing, and "written,
   * tested, no caller" is precisely the state `explorerKnowledgeSource` and
   * `explorerKnowledgeQuote` were found in - 217 curated entries and a complete quote gate
   * that no production path had ever reached. Making it required means a composition root
   * that forgets to supply it fails to compile instead of silently generating ungrounded
   * copy forever.
   */
  ground: (input: { query: string; facts?: ExplorerFactSet }) => Promise<DraftGrounding>;
  /**
   * The identity and published voice this message is written in.
   *
   * A DEPENDENCY rather than a constant so Phase 4 can point it at a real brand without
   * touching this file. Today it resolves to the historical default at rule-set version 0,
   * because there is no brand to look rules up by: `enrollments` carries no `brand_id`, and
   * Explorer's own content resolution deliberately runs `{ brand_id: null,
   * allow_unscoped: true }`. Version 0 means UNGOVERNED, not approved, and that is recorded
   * on the draft rather than left absent - an absent field reads as "nobody checked".
   */
  resolveBrandVoice: () => Promise<BrandVoice>;
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
  /**
   * Supersede the decision's current draft and write a new version, atomically.
   *
   * A separate dependency from `commitDraft` rather than a flag on it, because the two have
   * different safety properties: this one also writes to an EXISTING row, and the status
   * predicate that stops it touching the sender's queue lives in that UPDATE.
   */
  recommitDraft: (
    input: PersistDraftInput,
    decisionId: string,
    previousScheduledEmailId: string,
  ) => Promise<{ id: string; supersededId: string | null }>;
}

/** How this render differs from the nightly one. */
export interface RenderOptions {
  /**
   * Regenerate over an existing draft rather than writing a first one.
   *
   * Carries the draft being replaced, so the write can supersede exactly that row rather
   * than re-reading the decision and racing another regeneration.
   */
  regenerate?: {
    previousScheduledEmailId: string;
    /**
     * What the operator asked for in this attempt, free text.
     *
     * Appended to the step's instructions rather than replacing them: a brief is a nudge
     * ("shorter, lead with the cohort date"), not a new campaign. Replacing them would let
     * one regeneration silently drop the asset digest and the knowledge block.
     */
     brief?: string;
  };
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
export function describeContentAssets(
  assets: ReadonlyArray<Record<string, any>>,
  baseUrl: string,
): string {
  if (!assets?.length) return '';
  const lines = assets
    .map((a) => {
      const title = a?.title ?? a?.name;
      if (!title) return null;
      const summary = a?.summary ?? a?.description ?? '';
      // SCREENED HERE, BECAUSE THIS IS THE DOOR THE BANNED WORD CAME THROUGH.
      //
      // The 2026-10-31 live render put "Welcome to Your Free AI Preview" into 10 of 12
      // bodies. The quote gate in `explorerKnowledgeGrounding` already screens corpus
      // entries against the same rules, but it does not watch this line, so an asset title
      // reached the model unchecked. 5 of 468 active assets are excluded by this, about 1%.
      //
      // EXCLUDED RATHER THAN REWRITTEN: most affected titles are real titles of real
      // third-party content, and editing them would falsify a citation to pass a lint.
      if (!isSafeToAdvertise({ title: String(title), summary: String(summary) })) return null;
      // Absolutised because an email has no page to be relative to. The registry stores
      // `/portal/runtime/<id>` (`syncTimelineCards.ts:192`) and the model reproduced that
      // path verbatim into 5 of 12 bodies. `messageValidatorService`'s URL check is
      // `https?://`-anchored, so it could not see them.
      //
      // An unresolvable URL is DROPPED rather than guessed at. The model still has the
      // ALLOWED URLs block for a legitimate link, and the post-generation link guard below
      // refuses anything it invents.
      const rawUrl = a?.url ?? a?.portal_url ?? '';
      const url = rawUrl ? absolutizeHref(String(rawUrl), baseUrl) ?? '' : '';
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
  options: RenderOptions = {},
): Promise<DraftOutcome> {
  const regenerate = options.regenerate;

  // THE IDEMPOTENCY GUARD IS BYPASSED DELIBERATELY, AND NARROWLY. `draftSkipReason` returns
  // `already_drafted` as soon as a decision carries a `scheduled_email_id`, which is exactly
  // right for the nightly batch: without it, every run would re-draft every decision and
  // spend model budget doing it. A regeneration is the opposite case - an operator asking
  // for this one decision to be drafted again - so the planner is asked the question it was
  // built for, "what would this decision draft if it had none", with the pointer that trips
  // the guard removed. Nothing else about the decision is altered, so the step index still
  // comes from `countPriorDrafted` and a regeneration cannot wander onto a different step.
  const planFrom = regenerate ? { ...decision, scheduled_email_id: null } : decision;

  const plan = await planDecisionDraft(planFrom, deps);
  if (!plan.ok) return skipped(decision, plan.reason);
  const { leadId, campaignId, stepIndex, step, toEmail, totalSteps } = plan;

  const briefLine = regenerate?.brief?.trim()
    ? `\n\nTHIS IS A REVISION. The reviewer asked for: ${regenerate.brief.trim()}`
    : '';

  // `publicAppUrl`, NOT `frontendUrl`. `frontendUrl` defaults to `http://localhost:3000`,
  // and `messageValidatorService`'s ALLOWED_DOMAINS is
  // ['enterprise.colaberry.ai', 'advisor.colaberry.ai'] — so an unset FRONTEND_URL would
  // turn every absolutised link into an `Unknown URL found` issue and fail the draft.
  // `publicAppUrl` already defaults to the production host.
  const baseUrl = env.publicAppUrl;

  const instructions = `${step.ai_instructions ?? ''}${describeContentAssets(
    decision.selected_content_assets ?? [],
    baseUrl,
  )}${briefLine}`;

  let generated: GenerateMessageResult;
  let context: CompositeContext;
  let grounding: DraftGrounding = { available: false, reason: 'not_attempted' };
  let brandVoice: BrandVoice | undefined;
  // What the model was actually told. Persisted as-sent, so a reviewer reading the draft
  // beside its citations sees the same facts the generator saw.
  let groundedInstructions = instructions;
  try {
    context = await deps.buildContext(leadId, campaignId, stepIndex);
    brandVoice = await deps.resolveBrandVoice();

    // Its own try/catch: a knowledge-base outage must degrade this message to ungrounded
    // copy, which the fact guard still judges, rather than being reported as
    // `generation_failed` - a reason that would send someone to look at the model.
    try {
      grounding = await deps.ground({
        // The step's goal plus the instructions, which already carry the asset digest.
        // That is what the message is ABOUT, and so what the corpus should be searched on.
        query: [step.step_goal ?? '', instructions].filter((s) => s !== '').join(' '),
        facts: context.explorer,
      });
    } catch (err: any) {
      grounding = {
        available: false,
        reason: [err?.name, err?.message].filter(Boolean).join(': ') || 'grounding_failed',
      };
    }

    if (grounding.available && grounding.result.block !== '') {
      // Appended to `ai_instructions` for the same reason `describeContentAssets` is:
      // `buildUserPrompt` returns early when a composite context is present and never
      // reads `context_notes`, so a field that looks like grounding would supply none.
      groundedInstructions = `${instructions}\n\n${grounding.result.block}`;
    }

    // LAST, AND DELIBERATELY NOT PART OF `instructions`.
    //
    // `instructions` is what the grounding query above is built from — the step goal plus
    // the asset digest, which is what the message is ABOUT. A compliance rule is not a
    // topic, and folding it into that string would have the corpus searched for the banned
    // word and its approved alternatives, skewing which facts come back. So it is appended
    // after grounding has already run.
    //
    // Appended to `groundedInstructions` rather than kept separate because that field is
    // persisted as `ai_instructions` and documented above as "what the model was actually
    // told". A rule the model was given but the record omits would break that invariant and
    // leave a reviewer unable to tell an instructed draft from an uninstructed one.
    groundedInstructions = `${groundedInstructions}\n\n${bannedCopyInstruction()}`;

    generated = await deps.generate({
      channel: 'email',
      ai_instructions: groundedInstructions,
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
      brandVoice,
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

  // THE BACKSTOP THE FIRST REAL RENDER PROVED WAS MISSING.
  //
  // `validateGeneratedMessage` checks ungrounded dates, prices and seat counts, hallucinated
  // booking links and absolute URLs against ALLOWED_DOMAINS. It has no banned-word concept at
  // all, and its URL pattern is `https?://`-anchored, so a root-relative href is invisible to
  // it. On 2026-10-31 that combination let 12 of 12 drafts advertise a banned word and 5 of
  // 12 carry a link no email client can follow, with `rejected: 0` reported for the batch.
  //
  // Screening the assets above stops the known source. This reads the FINAL text, so a word
  // introduced by any other input — a seeded instruction, a corpus entry, the model itself —
  // still cannot reach a person. Two layers, because the asset filter is a door and this is
  // the wall.
  const linkFixed = absolutizeHrefs(verdict.content, baseUrl);
  const copyIssues = [
    ...bannedCopyIssues(linkFixed.html),
    ...emailLinkIssues(linkFixed.html, baseUrl),
  ];
  const body = linkFixed.html;
  const issues = [...verdict.issues, ...copyIssues];
  // A relative link is REPAIRED, not refused: there is exactly one correct absolute form and
  // guessing is not involved. A banned word is refused, because the compliant rewrite is a
  // judgement about meaning that no function should make silently.
  const autoFixed =
    linkFixed.rewritten > 0
      ? [
          ...verdict.autoFixed,
          `absolutised ${linkFixed.rewritten} relative link(s) against ${baseUrl}`,
        ]
      : verdict.autoFixed;
  const valid = verdict.valid && copyIssues.length === 0;

  const status = valid ? EXPLORER_DRAFT_STATUS : EXPLORER_DRAFT_REJECTED_STATUS;
  const persistInput: PersistDraftInput = (
    {
      lead_id: leadId,
      campaign_id: campaignId,
      step_index: stepIndex,
      // The seeded subject is real copy and is the fallback when the model
      // returns none — `explorerSequenceDefinitions.ts` writes a genuine
      // subject on all 24 steps even though every body_template is empty.
      subject: generated.subject || step.subject || 'Colaberry Enterprise AI',
      body,
      to_email: toEmail,
      ai_instructions: groundedInstructions,
      status,
      metadata: {
        explorer_decision_id: decision.id,
        explorer_enrollment_id: decision.enrollment_id,
        explorer_decision_date: decision.decision_date,
        explorer_step_index: stepIndex,
        quality_gate: {
          valid,
          issues,
          auto_fixed: autoFixed,
          // Recorded separately from `issues` so a reviewer can tell WHICH gate refused.
          // Collapsing them would make a legal-copy refusal indistinguishable from an
          // ungrounded date, and those have different owners and different fixes.
          copy_issues: copyIssues,
          links_absolutised: linkFixed.rewritten,
          // Absent means this was not treated as an Explorer send and the
          // fact guard did not apply. Empty means it WAS and nothing may be
          // quoted, which is the strictest state, not the most permissive.
          fact_set_present: context.explorer !== undefined,
        },
        // Every fact the copy was allowed to use, and what the gate refused. `available:
        // false` means the corpus never loaded; `available: true` with no citations means
        // it loaded and offered nothing quotable, which is a content problem to fix at the
        // source rather than a gate to loosen.
        knowledge: grounding.available
          ? {
              available: true,
              cited: grounding.result.citations,
              quotable_count: grounding.result.quotableCount,
              refusals: grounding.result.refusalCounts,
              copy_rules_applied: grounding.result.copyRulesApplied,
            }
          : { available: false, reason: grounding.reason },
        // Which identity the copy was written as, and which published rule set backed its
        // voice. `published: false` is a STATED NEGATIVE: version 0 is "nobody has written
        // a voice down", and leaving the field out would be indistinguishable from a
        // renderer that never looked.
        brand_voice: brandVoice
          ? {
              name: brandVoice.name,
              rules_version: brandVoice.rulesVersion,
              published: brandVoice.rulesVersion > 0,
            }
          : null,
        // Present only on a regeneration: which draft this replaced, and what the reviewer
        // asked for. Stored so the history answers "why is version 3 different" without
        // anyone having to remember, and so a brief that produced worse copy is auditable.
        revision: regenerate
          ? { of: regenerate.previousScheduledEmailId, brief: regenerate.brief?.trim() || null }
          : null,
        model: generated.model,
        tokens_used: generated.tokens_used,
      },
    }
  );

  // Two writers, chosen by what this render IS rather than by a flag inside one of them:
  // the first draft inserts, a regeneration also supersedes, and the status predicate that
  // keeps the supersede away from the sender's queue lives in that second writer.
  const written = regenerate
    ? await deps.recommitDraft(persistInput, decision.id, regenerate.previousScheduledEmailId)
    : { id: await deps.commitDraft(persistInput, decision.id), supersededId: null };

  return {
    decision_id: decision.id,
    enrollment_id: decision.enrollment_id,
    status: valid ? 'drafted' : 'rejected',
    reason: null,
    scheduled_email_id: written.id,
    step_index: stepIndex,
    issues,
    superseded_scheduled_email_id: written.supersededId,
  };
}
