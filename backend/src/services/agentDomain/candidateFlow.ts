/**
 * Whose turn is it, and what exactly do they do next.
 *
 * One pure function, read by both sides. The builder's `/capability` entry point calls it to say
 * what to do; the Command Center calls it to build Ali's queue. They cannot disagree, because
 * there is nothing for them to disagree about: same input, same function, same sentence.
 *
 * ## Why the action is a SENTENCE and not a status
 *
 * The old ladder's stories were 964 titles with byte-identical bodies averaging 51 characters.
 * A status tells you where something is; it does not tell anybody what to do, and the measured
 * result was 853 tasks above R0 with zero completions. Every branch here returns a sentence
 * naming an action, and the test asserts no branch returns an empty one.
 *
 * ## Why `blocked_reason` exists beside `turn`
 *
 * `turn: 'owner'` says the builder should stop pushing. It does not say WHY, and a builder who
 * cannot see why reads it as being ignored. `blocked_reason` is the sentence they can paste to
 * their manager. It is non-null exactly when the turn is not theirs.
 */

import type { AutonomyLevel } from './autonomyLadder';
import { BUILDER_STAGES, artifactPathFor, stageFor } from './builderPath';
import { type CandidateStage, derive } from './candidateStages';
import type { CandidateProductState } from '../../db/ensureAgentDomainCandidateSchema';
import type { AgentChangeRequestStatus } from './agentChangeRequest';

export type FlowTurn = 'builder' | 'owner' | 'nobody';

/** The fields of a candidate row this function reads. Nothing else is needed or touched. */
export interface FlowCandidate {
  readonly domain_key: string;
  readonly title: string;
  readonly product_state: CandidateProductState;
  readonly proven_by_hand_at: Date | string | null;
  readonly matched_feature_key?: string | null;
}

/** The status of each request the candidate points at, or null when it points at none. */
export interface FlowRequests {
  readonly screen_status: AgentChangeRequestStatus | null;
  readonly tool_status: AgentChangeRequestStatus | null;
}

export interface FlowStep {
  readonly stage: CandidateStage;
  readonly turn: FlowTurn;
  /** What the person whose turn it is does next. Never empty. */
  readonly action: string;
  /** Why the builder cannot move, or null when they can. */
  readonly blocked_reason: string | null;
  /** The file this stage produces, with the slug already substituted. */
  readonly artifact_path: string;
}

/** A URL-safe slug from the candidate's title, so the artifact path is stable per candidate. */
export function slugFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

/** The thing the platform owes, in words, for the two states that put the ball in Ali's court. */
function platformOwes(candidate: FlowCandidate): string {
  const named = candidate.matched_feature_key
    ? `for ${candidate.matched_feature_key}`
    : 'for this';
  if (candidate.product_state === 'api_only') {
    // Deliberately says SCREEN and deliberately does not say scope sheet. `api_only` means the
    // machinery is already there and nobody built the page: asking for a scope sheet would send
    // the builder to write a case for something that mostly exists.
    return `Ali owes you the screen ${named}. The endpoints are already there and no page calls `
      + 'them, so there is nothing for you to scope and nothing for you to try yet.';
  }
  return `Ali owes you a ruling ${named}. The app does part of this, and whether the part it `
    + 'does is enough is his call, not something you can settle by trying harder.';
}

/**
 * What happens next on this candidate.
 *
 * `gateSize` is the rung's option C target: how many capabilities the agent must do under watch
 * before the rung is cleared. `clearedInDomain` is how many are already there. Together they are
 * the only reason `turn: 'nobody'` is reachable: a candidate that has been through the whole path
 * in a domain whose gate is already met owes nobody anything.
 */
export function nextStep(
  candidate: FlowCandidate,
  requests: FlowRequests,
  gateSize: number,
  clearedInDomain = 0,
  rung?: AutonomyLevel,
): FlowStep {
  const stage = derive({
    product_state: candidate.product_state,
    proven_by_hand_at: candidate.proven_by_hand_at,
    screen_request_status: requests.screen_status,
    tool_request_status: requests.tool_status,
  });

  const slug = slugFor(candidate.title);
  const artifact_path = artifactPathFor(stage, slug);
  const owned = stageFor(stage).owned_by;
  const rungLabel = rung ? ` for ${rung}` : '';
  const remaining = Math.max(0, gateSize - clearedInDomain);

  switch (stage) {
    case 'proposed':
      return {
        stage,
        turn: 'builder',
        action: `Run "${candidate.title}" past the front door and record what the app already `
          + `does about it, in ${artifact_path}.`,
        blocked_reason: null,
        artifact_path,
      };

    case 'scope_sheet_owed':
      return {
        stage,
        turn: 'builder',
        action: `The app cannot do this at all. Write the scope sheet in ${artifact_path}: who `
          + 'acts on the output, what number says it worked, and what the system already records '
          + 'that would produce that number.',
        blocked_reason: null,
        artifact_path,
      };

    case 'platform_owed':
      return {
        stage,
        turn: 'owner',
        action: `${platformOwes(candidate)} Write what is missing in ${artifact_path} so the `
          + 'request is buildable, then wait.',
        blocked_reason: platformOwes(candidate),
        artifact_path,
      };

    case 'screen_built':
      return {
        stage,
        turn: 'builder',
        action: `The screen is there now. Use it on real work until it does the job, and record `
          + `in ${artifact_path} what worked and what did not. A clean report with nothing to `
          + 'say is a sign it was not really used.',
        blocked_reason: null,
        artifact_path,
      };

    case 'by_hand_pending':
      return {
        stage,
        turn: 'builder',
        action: `The app already does this. Do it by hand yourself first, then record the run `
          + `in ${artifact_path}: what you entered, what came out, how long it took, and what `
          + 'was annoying about it.',
        blocked_reason: null,
        artifact_path,
      };

    case 'proven_by_hand':
      return {
        stage,
        turn: 'builder',
        action: `You have done it by hand, so you know what it costs. Write the tool request in `
          + `${artifact_path}, citing that run rather than describing the idea.`,
        blocked_reason: null,
        artifact_path,
      };

    case 'tool_requested':
      return {
        stage,
        turn: 'owner',
        action: `The request is filed and sitting with Ali. Record its id in ${artifact_path} so `
          + 'the decision can be found later, and move to your next candidate.',
        blocked_reason: 'The tool request is filed and waiting on Ali. Nothing here is yours to '
          + 'move, so start another candidate rather than waiting.',
        artifact_path,
      };

    case 'agent_watched':
      if (remaining === 0) {
        return {
          stage,
          turn: 'nobody',
          action: `Done. The agent runs this and the gate${rungLabel} is met at `
            + `${clearedInDomain} of ${gateSize}. Nothing is owed on this candidate.`,
          blocked_reason: null,
          artifact_path,
        };
      }
      return {
        stage,
        turn: 'builder',
        action: `Watch a run and compare it against what you produced by hand, in `
          + `${artifact_path}. ${remaining} more capability${remaining === 1 ? '' : 'ies'} `
          + `needed to clear the gate${rungLabel}.`,
        blocked_reason: null,
        artifact_path,
      };

    default: {
      // Unreachable: `derive` is total over `CANDIDATE_STAGES` and every member has a case above,
      // which the table-driven test proves by walking `BUILDER_STAGES`.
      const never: never = stage;
      throw new Error(`UnknownCandidateStage: ${String(never)}`);
    }
  }
}

/**
 * The turn each stage yields when the gate is not yet met, as a table.
 *
 * Built from `BUILDER_STAGES` rather than restated, so a stage whose ownership changes there
 * cannot keep a stale turn here. `agent_watched` is the one stage whose turn depends on something
 * other than the stage itself, which is why it is computed rather than looked up.
 */
export const TURN_BY_STAGE: Readonly<Record<CandidateStage, FlowTurn>> = Object.freeze(
  Object.fromEntries(BUILDER_STAGES.map((s) => [s.stage, s.owned_by as FlowTurn])),
) as Readonly<Record<CandidateStage, FlowTurn>>;
