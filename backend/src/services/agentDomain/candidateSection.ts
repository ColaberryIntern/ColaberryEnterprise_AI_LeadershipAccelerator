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
import { countsTowardGate } from './candidateStages';

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
