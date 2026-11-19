/**
 * The candidate list's TYPES and its snapshot section. No models, no database, no I/O.
 *
 * ## Why this is a separate module from `candidateService.ts`
 *
 * `agentDomainSnapshot.ts` says of itself, two lines above its imports: *"Pure. No I/O, no clock,
 * no randomness: the bridge supplies every input."* Importing `candidatesSection` from
 * `candidateService.ts` made that false, and not harmlessly: `candidateService` imports
 * `models/AgentDomainCandidate`, which calls `.init(..., { sequelize })` at MODULE SCOPE. So the
 * snapshot dragged a live Sequelize model into every consumer of `agentDomainRoutes.ts`, and five
 * untouched test suites — 138 tests — stopped being able to run at all, with
 * `TypeError: Cannot read properties of undefined (reading 'define')`.
 *
 * Nothing in this file needs the model. `candidatesSection` is a pure projection of data somebody
 * else loaded, and `countsTowardGate` is a pure predicate. So the pure half lives here, the
 * database half stays in `candidateService.ts`, and the snapshot imports only this.
 *
 * A test asserts `agentDomainSnapshot.ts` imports nothing from `../../models`, because the purity
 * claim in its own header was true, stated, and then quietly broken by one import line.
 */

import type {
  CandidateProductState,
  CandidateSource,
} from '../../db/ensureAgentDomainCandidateSchema';
import type { AgentChangeRequestStatus } from './agentChangeRequest';
import type { FlowStep } from './candidateFlow';
import { type CandidateStage, countsTowardGate } from './candidateStages';

/** One candidate as a page sees it: the row, the two statuses, and what happens next. */
export interface CandidateView {
  readonly id: string;
  readonly domain_key: string;
  readonly title: string;
  readonly source: CandidateSource;
  readonly source_note: string | null;
  readonly product_state: CandidateProductState;
  readonly matched_feature_key: string | null;
  readonly proven_by_hand_at: string | null;
  readonly screen_request_id: string | null;
  readonly screen_request_status: AgentChangeRequestStatus | null;
  readonly tool_request_id: string | null;
  readonly tool_request_status: AgentChangeRequestStatus | null;
  readonly step: FlowStep;
}

export interface CandidateListResult {
  readonly candidates: CandidateView[];
  /** Why the list looks the way it does. Never omitted, so an empty page can explain itself. */
  readonly reason: string;
  readonly scoped_to_domains: string[];
}

/**
 * The snapshot's `candidates` section.
 *
 * Follows `verificationSection`'s shape exactly: an ABSENT list renders as `known: false` with a
 * note, never as an empty list. Silence and zero are different answers, and a page that renders
 * "0 candidates" when the platform simply did not say is lying in the quietest possible way.
 */
export function candidatesSection(
  result: CandidateListResult | undefined,
): Record<string, unknown> {
  if (!result) {
    return {
      known: false,
      note:
        'This snapshot carries no candidate list. That means the platform did not supply one, '
        + 'NOT that there is nothing on your list. Say "not reported" in words; do not render '
        + 'zero candidates.',
      candidates: [],
    };
  }

  const byTurn = { builder: 0, owner: 0, nobody: 0 };
  for (const c of result.candidates) byTurn[c.step.turn] += 1;

  return {
    known: true,
    reason: result.reason,
    scoped_to_domains: [...result.scoped_to_domains],
    summary: {
      candidates: result.candidates.length,
      // The headline this section exists for: how many are waiting on YOU, and how many are not.
      yours_to_move: byTurn.builder,
      waiting_on_the_owner: byTurn.owner,
      finished: byTurn.nobody,
      cleared_the_gate: result.candidates.filter((c) => countsTowardGate(c.step.stage)).length,
    },
    candidates: result.candidates.map((c) => ({
      id: c.id,
      domain_key: c.domain_key,
      title: c.title,
      source: c.source,
      product_state: c.product_state,
      stage: c.step.stage,
      turn: c.step.turn,
      action: c.step.action,
      blocked_reason: c.step.blocked_reason,
      artifact_path: c.step.artifact_path,
      proven_by_hand_at: c.proven_by_hand_at,
    })),
  };
}

/**
 * The stages where the PRODUCT owes the builder something, or has just delivered it.
 *
 * `platform_owed` is the fork Ali named as the missing piece: the app has the endpoints and nobody
 * built the page, or it half does the job and whether that half is enough is his ruling. The
 * builder cannot clear either by working harder.
 *
 * `screen_built` is the other side of the same fork. Ali built it, and what is owed now is a
 * builder actually using it in anger. It belongs on this board because a screen delivered and
 * never used is the failure mode that looks like success.
 *
 * The plan named a third stage, "screen-tested". There is no such stage in the final vocabulary
 * and there should not be: once a builder has tested the screen the candidate moves to
 * `by_hand_pending`, where the product owes nothing. A stage for "tested" would be a stage nobody
 * is ever in.
 */
export const OWED_BY_PRODUCT_STAGES: ReadonlyArray<CandidateStage> = Object.freeze([
  'platform_owed',
  'screen_built',
]);

/**
 * The gap board, per domain: what the platform owes before this builder can go any further.
 *
 * This is the section that makes the api_only fork visible without anybody opening seven
 * repositories. It is deliberately NOT a filter the page applies to the full candidate list: the
 * list is scoped to the caller, and a reader who had to derive "who is blocked on Ali" by
 * filtering client-side would get a different answer on every page that tried.
 */
export function owedByProductSection(
  result: CandidateListResult | undefined,
): Record<string, unknown> {
  if (!result) {
    return {
      known: false,
      note:
        'This snapshot carries no candidate list, so it cannot say what the product owes you. '
        + 'That is the platform not having supplied one, NOT a statement that nothing is owed.',
      owed: [],
    };
  }

  const owed = result.candidates.filter((c) => OWED_BY_PRODUCT_STAGES.includes(c.step.stage));

  return {
    known: true,
    reason: owed.length === 0
      ? 'Nothing is waiting on the platform for you right now. Every candidate on your list is '
        + 'either yours to move or already through.'
      : `${owed.length} of your ${result.candidates.length} candidates cannot move until the `
        + 'platform does something. You are not blocked on yourself.',
    scoped_to_domains: [...result.scoped_to_domains],
    stages_counted: [...OWED_BY_PRODUCT_STAGES],
    summary: {
      owed: owed.length,
      // Said apart, because they are owed by different actions. One needs Ali to build or rule;
      // the other needs the builder to go and use what he built.
      waiting_for_a_screen_or_a_ruling: owed.filter((c) => c.step.stage === 'platform_owed').length,
      built_and_not_yet_used: owed.filter((c) => c.step.stage === 'screen_built').length,
    },
    owed: owed.map((c) => ({
      id: c.id,
      domain_key: c.domain_key,
      title: c.title,
      product_state: c.product_state,
      matched_feature_key: c.matched_feature_key,
      stage: c.step.stage,
      turn: c.step.turn,
      action: c.step.action,
      blocked_reason: c.step.blocked_reason,
      screen_request_id: c.screen_request_id,
      screen_request_status: c.screen_request_status,
    })),
  };
}
