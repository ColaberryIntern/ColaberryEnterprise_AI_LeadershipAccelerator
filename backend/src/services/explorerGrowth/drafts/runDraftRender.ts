import { env } from '../../../config/env';
import { isExplorerFeatureEnabled } from '../../../config/explorerGrowthFlags';
import { redactForLogs } from '../../../utils/piiRedaction';
import { DEFAULT_BRAND_VOICE, generateMessage } from '../../aiMessageService';
import { buildCompositeContext } from '../../contextGraphService';
import { validateGeneratedMessage } from '../../messageValidatorService';
import type { ExplorerFactSet } from '../explorerFactGuard';
import { groundDraft } from '../explorerKnowledgeGrounding';
import { loadExplorerKnowledge } from '../explorerKnowledgeLoader';
import { type DraftOutcome, type DraftRenderResult } from './draftContracts';
import { tallyReasons } from './draftEligibility';
import {
  commitDraft,
  countPriorDrafted,
  loadDecisionsForDate,
  loadRecipientEmail,
  loadSequenceSteps,
  recommitDraft,
} from './draftRepository';
import {
  planDecisionDraft,
  renderDecisionDraft,
  type DraftGrounding,
  type DraftRenderDeps,
} from './renderDecisionDraft';

/**
 * Explorer Growth OS — draft render batch. Phase 1 of
 * `docs/EXPLORER_MESSAGING_PLAN.html`.
 *
 * Reads the decisions the Governor wrote for one date and renders a draft for
 * each one that would have sent an email. Writes nothing sendable; see
 * `draftContracts.ts` for why that is structural rather than a convention.
 */

/**
 * Hard ceiling on model calls per run.
 *
 * There are ~153 Explorers, so a normal night is well under this. The cap
 * exists for the abnormal night: a backfill pointed at a wide date range, or a
 * decision table that grew while nobody was looking. An uncapped nightly job
 * that calls a paid API once per row is a cost incident waiting for its
 * trigger, and the cap turns that into a truncated run plus a loud log line.
 */
export const DEFAULT_MAX_GENERATIONS = 200;

export interface DraftRenderOptions {
  /** `YYYY-MM-DD`. Defaults to today in UTC, matching `decision_date`. */
  decisionDate?: string;
  /**
   * Resolve eligibility and report, generating nothing and writing nothing.
   * Costs a few reads and zero model calls.
   */
  dryRun?: boolean;
  maxGenerations?: number;
  /** Cap on decisions READ, for a narrow test run. */
  limit?: number;
}

/** Today in UTC as `YYYY-MM-DD`, the format `decision_date` stores. */
function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The live grounding adapter - the ONE place the two knowledge modules meet.
 *
 * Composition happens here rather than inside either module so both stay pure and
 * directly testable: `explorerKnowledgeLoader` does the I/O, `groundDraft` does the gating,
 * ranking and rendering, and neither imports the other.
 *
 * There is no separate batch-level preload. The loader's own TTL cache already means a
 * batch of 142 decisions performs ONE fetch, and a second caching layer here would be a
 * second thing to keep in step with it.
 *
 * A failed load returns `available: false` carrying the reason, never throws: the caller
 * degrades that message to ungrounded copy rather than losing the draft.
 */
async function groundForDraft(input: {
  query: string;
  facts?: ExplorerFactSet;
}): Promise<DraftGrounding> {
  const loaded = await loadExplorerKnowledge();
  if (!loaded.loaded) {
    return { available: false, reason: `${loaded.reason}: ${loaded.detail}` };
  }
  return {
    available: true,
    result: groundDraft({ base: loaded.base, query: input.query, facts: input.facts }),
  };
}

function liveDeps(): DraftRenderDeps {
  return {
    loadSequenceSteps,
    countPriorDrafted,
    loadRecipientEmail,
    buildContext: buildCompositeContext,
    generate: generateMessage,
    validate: validateGeneratedMessage,
    ground: groundForDraft,
    // THE PHASE 4 SEAM. Explorer has no brand to resolve rules by today: `enrollments`
    // carries no `brand_id` and content resolution runs `{ brand_id: null,
    // allow_unscoped: true }` on purpose. So this returns the historical identity at
    // rule-set version 0, which the characterization test proves produces a byte-identical
    // prompt to passing nothing. When Phase 4 gives a learner a brand, only this line
    // changes - to read the brand's published `voice` through `getCurrentRules`.
    resolveBrandVoice: async () => DEFAULT_BRAND_VOICE,
    commitDraft,
    recommitDraft,
  };
}

function emptyResult(attempted = 0): DraftRenderResult {
  return {
    attempted,
    drafted: 0,
    rejected: 0,
    skipped: 0,
    failed: 0,
    by_reason: {},
    outcomes: [],
  };
}

function summarize(attempted: number, outcomes: DraftOutcome[]): DraftRenderResult {
  return {
    attempted,
    drafted: outcomes.filter((o) => o.status === 'drafted').length,
    rejected: outcomes.filter((o) => o.status === 'rejected').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    by_reason: tallyReasons(outcomes.map((o) => o.reason)),
    outcomes,
  };
}

/**
 * Render drafts for one date.
 *
 * ONE DECISION'S FAILURE NEVER ABORTS THE BATCH, the same contract
 * `runGovernorBatch` holds itself to. A model timeout on learner 12 must not
 * cost the other 140 their drafts, so every failure becomes a reported
 * outcome.
 */
export async function runDraftRenderBatch(
  options: DraftRenderOptions = {},
): Promise<DraftRenderResult> {
  const decisionDate = options.decisionDate ?? todayUtc();
  const maxGenerations = options.maxGenerations ?? DEFAULT_MAX_GENERATIONS;
  const decisions = await loadDecisionsForDate(decisionDate, options.limit);
  if (!decisions.length) return emptyResult();

  const deps = liveDeps();
  const outcomes: DraftOutcome[] = [];
  let generations = 0;

  for (const decision of decisions) {
    try {
      if (options.dryRun) {
        const plan = await planDecisionDraft(decision, deps);
        outcomes.push({
          decision_id: decision.id,
          enrollment_id: decision.enrollment_id,
          // A dry run reports what WOULD happen. `drafted` here means
          // "eligible and resolvable", and no row was written for it.
          status: plan.ok ? 'drafted' : 'skipped',
          reason: plan.ok ? null : plan.reason,
          scheduled_email_id: null,
          step_index: plan.ok ? plan.stepIndex : null,
          issues: [],
        });
        continue;
      }

      if (generations >= maxGenerations) {
        outcomes.push({
          decision_id: decision.id,
          enrollment_id: decision.enrollment_id,
          status: 'skipped',
          reason: 'cap_reached',
          scheduled_email_id: null,
          step_index: null,
          issues: [],
        });
        continue;
      }

      const outcome = await renderDecisionDraft(decision, deps);
      // Counted only when a model call actually happened. A skip is free, and
      // charging the cap for it would let a table full of WAIT rows exhaust
      // the budget before reaching a single draftable decision.
      if (outcome.status === 'drafted' || outcome.status === 'rejected') generations += 1;
      outcomes.push(outcome);
    } catch (err: any) {
      outcomes.push({
        decision_id: decision.id,
        enrollment_id: decision.enrollment_id,
        status: 'failed',
        reason: null,
        scheduled_email_id: null,
        step_index: null,
        issues: [err?.name || 'DraftRenderError', err?.message ?? 'unknown'].filter(Boolean),
      });
    }
  }

  const result = summarize(decisions.length, outcomes);

  console.log(
    redactForLogs(
      JSON.stringify({
        event: 'explorer.draft_render.completed',
        service: 'explorer-growth',
        level: 'info',
        outcome: result.failed > 0 ? 'partial' : 'success',
        decision_date: decisionDate,
        dry_run: options.dryRun === true,
        attempted: result.attempted,
        drafted: result.drafted,
        rejected: result.rejected,
        skipped: result.skipped,
        failed: result.failed,
        by_reason: result.by_reason,
        generations,
        cap: maxGenerations,
        cap_reached: generations >= maxGenerations,
      }),
    ),
  );

  return result;
}

/**
 * Flag-gated entry point for the cron.
 *
 * Read through `isExplorerFeatureEnabled` so BOTH the master flag and
 * `draftRender` must be on — a direct sub-flag read would let this activate
 * while the master switch is off, and that is the one thing a dark launch is
 * for. The operator script calls `runDraftRenderBatch` directly instead, since
 * a human running it deliberately is its own authorisation.
 */
export async function runScheduledDraftRender(
  options: DraftRenderOptions = {},
): Promise<DraftRenderResult | { skipped: true }> {
  if (!isExplorerFeatureEnabled('draftRender', env.explorerGrowth)) {
    return { skipped: true };
  }
  return runDraftRenderBatch(options);
}
