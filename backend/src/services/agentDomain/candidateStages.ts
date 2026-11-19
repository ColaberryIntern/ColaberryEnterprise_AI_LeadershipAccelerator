/**
 * The eight stages of a capability candidate's life, and the total function that derives one.
 *
 * ## The stage is DERIVED, never stored
 *
 * There is no `stage` column on `agent_domain_candidates` and there never will be. A stored stage
 * is a second copy of a fact the approval spine already holds, and two copies of one fact drift:
 * the day somebody approves a request through the governance console without going through this
 * path, a stored stage would still read `tool_requested` while the spine reads `approved`.
 *
 * `derive()` reads the row plus the two request statuses and returns exactly one stage, every
 * time, for every input. That is why it is pure, why it lives in its own module, and why the test
 * enumerates the whole cross-product rather than the cases somebody thought of.
 *
 * ## The four-rung ladder these eight stages implement
 *
 * Ali's ladder is: do it by hand, do it in the app, request the tool, agent does it watched. The
 * eight stages are that ladder plus the fork he named as the missing piece — *if the functionality
 * does not exist in the app, an approved request means Ali builds the page, they test until it
 * works, and only then are they doing it by hand; if it exists they skip that part.*
 *
 * So the path forks on what the product already does, rejoins at `proven_by_hand`, and the fork is
 * the reason `platform_owed` and `scope_sheet_owed` are two stages rather than one: an `api_only`
 * gap is Ali's to close, and a `not_built` candidate is the builder's to scope. Two owners, two
 * stages, because a stage with two possible owners cannot tell anybody whose turn it is.
 */

import type {
  CandidateProductState,
} from '../../db/ensureAgentDomainCandidateSchema';
import type { AgentChangeRequestStatus } from './agentChangeRequest';

/**
 * The eight stages, in path order, frozen.
 *
 * `scope_sheet_owed` sits second rather than last because it is where a `not_built` candidate goes
 * immediately, not somewhere it ends up. Path order here is the order of the HAPPY path with the
 * branch in the position the branch is taken, which is what the admin surface renders as a track.
 */
export const CANDIDATE_STAGES = Object.freeze([
  /** On the list, nobody has run it past the front door yet. */
  'proposed',
  /** The product cannot do this. The builder owes a scope sheet before anything is built. */
  'scope_sheet_owed',
  /** The product half does this, or does it with no screen. Ali owes a screen or a ruling. */
  'platform_owed',
  /** Ali built it. The builder owes a session actually using it. */
  'screen_built',
  /** The product does this and the builder has not yet done it by hand. */
  'by_hand_pending',
  /** Done by hand, in the app, with evidence. The first rung is genuinely cleared. */
  'proven_by_hand',
  /** The tool request is filed and sitting in the approval spine. Ali's decision. */
  'tool_requested',
  /** Approved. The agent does it and somebody watches. The rung's gate can count this one. */
  'agent_watched',
] as const);

export type CandidateStage = typeof CANDIDATE_STAGES[number];

/**
 * What `derive` needs: the row's own two fields, and the status of each request it points at.
 *
 * A request status is `null` when the candidate points at no such request. That is a FIFTH value
 * beside the spine's four, and it is why the cross-product test enumerates five per request rather
 * than the four the plan first estimated: `withdrawn` is a real status in
 * `AgentChangeRequestStatus` and absence is a real state, so the honest grid is 5 x 5 x 5 = 125.
 */
export interface CandidateStageInput {
  readonly product_state: CandidateProductState;
  /** Null until the builder has actually done it by hand, in the product, with evidence. */
  readonly proven_by_hand_at: Date | string | null;
  /** The status of `screen_request_id`'s row, or null when there is no such request. */
  readonly screen_request_status: AgentChangeRequestStatus | null;
  /** The status of `tool_request_id`'s row, or null when there is no such request. */
  readonly tool_request_status: AgentChangeRequestStatus | null;
}

/**
 * Where a candidate sits when nothing has been requested and nothing proven: a TOTAL map, so
 * adding a product state to the catalog is a compile error here rather than a runtime `undefined`.
 *
 * `partly` and `api_only` both land on `platform_owed` and that is deliberate. They differ in what
 * Ali owes — a ruling versus a screen — and that difference belongs in the ACTION text the flow
 * controller writes, not in the stage. Two stages that share an owner and a position on the track
 * would make the track longer without making it more informative.
 */
const STAGE_WHEN_UNTOUCHED: Readonly<Record<CandidateProductState, CandidateStage>> = Object.freeze({
  unchecked: 'proposed',
  in_app: 'by_hand_pending',
  partly: 'platform_owed',
  api_only: 'platform_owed',
  not_built: 'scope_sheet_owed',
});

/**
 * The one stage this candidate is at. Total: every input returns a member of `CANDIDATE_STAGES`.
 *
 * ## Read it most-advanced-first, and read the fall-through as the point
 *
 * An APPROVED tool request outranks everything, because the agent doing the work under watch is
 * the last rung and nothing earlier can be more true than that. A SUBMITTED one outranks the
 * by-hand evidence for the same reason: the ball is in Ali's court and saying `proven_by_hand`
 * would hide a decision he owes.
 *
 * A DECLINED or WITHDRAWN request deliberately falls through instead of getting a stage of its
 * own. A declined tool request does not undo the by-hand proof, and it does not move the candidate
 * backwards: the builder is exactly where they were before they asked, which is
 * `proven_by_hand`, with the decline recorded on the spine where decisions live. Giving decline a
 * stage here would be this module expressing a decision, which is the thing the whole design
 * refuses to do.
 */
export function derive(input: CandidateStageInput): CandidateStage {
  if (input.tool_request_status === 'approved') return 'agent_watched';
  if (input.tool_request_status === 'submitted') return 'tool_requested';

  if (input.proven_by_hand_at !== null && input.proven_by_hand_at !== undefined) {
    return 'proven_by_hand';
  }

  if (input.screen_request_status === 'approved') return 'screen_built';
  if (input.screen_request_status === 'submitted') return 'platform_owed';

  return STAGE_WHEN_UNTOUCHED[input.product_state];
}

/** True when the stage is one nobody can advance past without a decision from the owner. */
export function isOwnerTurn(stage: CandidateStage): boolean {
  return stage === 'platform_owed' || stage === 'tool_requested';
}

/**
 * The stages that count toward a rung's gate.
 *
 * Only `agent_watched` does. A candidate that has been proven by hand is real progress and is NOT
 * a cleared gate: the gate asks whether the agent does this, watched, and the whole point of
 * option C is that the number of those required varies by rung. Counting `proven_by_hand` would
 * make every rung look nearly met while no agent did anything, which is the exact failure the
 * 964-story cross-product produced.
 */
export function countsTowardGate(stage: CandidateStage): boolean {
  return stage === 'agent_watched';
}
