/**
 * The flow controller, graded on the two things that actually break it.
 *
 * **1. A branch that returns an empty action.** The old ladder's measured failure was 964 story
 * bodies byte-identical to their titles and 853 tasks above R0 with zero completions: it told
 * people where they were and never what to do. Every branch here is walked and its action
 * inspected, so an empty or placeholder one cannot ship.
 *
 * **2. The fork sending a builder the wrong way.** `api_only` means the machinery is there and
 * nobody built the page. Sending that builder to write a scope sheet asks them to argue for
 * something that mostly exists, and is the exact mistake the front door was rebuilt to stop.
 */

import { CANDIDATE_STAGES, type CandidateStage } from '../candidateStages';
import { BUILDER_STAGES } from '../builderPath';
import {
  TURN_BY_STAGE,
  type FlowCandidate,
  type FlowRequests,
  nextStep,
  slugFor,
} from '../candidateFlow';
import type { CandidateProductState } from '../../../db/ensureAgentDomainCandidateSchema';
import type { AgentChangeRequestStatus } from '../agentChangeRequest';

const NO_REQUESTS: FlowRequests = { screen_status: null, tool_status: null };

function candidate(over: Partial<FlowCandidate> = {}): FlowCandidate {
  return {
    domain_key: 'admissions',
    title: 'Draft the weekly intake summary',
    product_state: 'in_app',
    proven_by_hand_at: null,
    matched_feature_key: null,
    ...over,
  };
}

/** Every combination that reaches each of the eight stages, so the walk is real. */
const REACHES: ReadonlyArray<{
  stage: CandidateStage;
  product_state: CandidateProductState;
  proven: boolean;
  screen: AgentChangeRequestStatus | null;
  tool: AgentChangeRequestStatus | null;
}> = [
  { stage: 'proposed', product_state: 'unchecked', proven: false, screen: null, tool: null },
  { stage: 'scope_sheet_owed', product_state: 'not_built', proven: false, screen: null, tool: null },
  { stage: 'platform_owed', product_state: 'api_only', proven: false, screen: null, tool: null },
  { stage: 'screen_built', product_state: 'api_only', proven: false, screen: 'approved', tool: null },
  { stage: 'by_hand_pending', product_state: 'in_app', proven: false, screen: null, tool: null },
  { stage: 'proven_by_hand', product_state: 'in_app', proven: true, screen: null, tool: null },
  { stage: 'tool_requested', product_state: 'in_app', proven: true, screen: null, tool: 'submitted' },
  { stage: 'agent_watched', product_state: 'in_app', proven: true, screen: null, tool: 'approved' },
];

function stepFor(r: typeof REACHES[number], gateSize = 3, cleared = 0) {
  return nextStep(
    candidate({
      product_state: r.product_state,
      proven_by_hand_at: r.proven ? new Date('2026-11-18T12:00:00Z') : null,
    }),
    { screen_status: r.screen, tool_status: r.tool },
    gateSize,
    cleared,
  );
}

describe('the walk covers all eight stages', () => {
  it('REACHES actually reaches every stage, and no stage twice', () => {
    const reached = REACHES.map((r) => stepFor(r).stage);
    expect(reached).toEqual(REACHES.map((r) => r.stage));
    expect([...reached].sort()).toEqual([...CANDIDATE_STAGES].sort());
  });
});

describe('every stage maps to exactly one turn', () => {
  it.each(REACHES.map((r) => [r.stage, r] as const))(
    '%s yields one turn, from one branch',
    (_stage, r) => {
      const step = stepFor(r);
      expect(['builder', 'owner', 'nobody']).toContain(step.turn);
      // The turn table is built from BUILDER_STAGES, so this also proves the two agree.
      expect(step.turn).toBe(TURN_BY_STAGE[step.stage]);
    },
  );

  it('the turn table covers every stage and matches BUILDER_STAGES', () => {
    expect(Object.keys(TURN_BY_STAGE).sort()).toEqual([...CANDIDATE_STAGES].sort());
    for (const s of BUILDER_STAGES) expect(TURN_BY_STAGE[s.stage]).toBe(s.owned_by);
  });

  it('exactly two stages are the owner\'s turn', () => {
    const owner = REACHES.filter((r) => stepFor(r).turn === 'owner').map((r) => r.stage);
    expect(owner).toEqual(['platform_owed', 'tool_requested']);
  });
});

describe('no branch returns an empty action', () => {
  it.each(REACHES.map((r) => [r.stage, r] as const))('%s names an action', (_stage, r) => {
    const step = stepFor(r);
    expect(typeof step.action).toBe('string');
    expect(step.action.trim().length).toBeGreaterThan(30);
    expect(step.action).not.toMatch(/TODO|TBD|placeholder|coming soon/i);
    expect(step.artifact_path.trim().length).toBeGreaterThan(0);
  });

  it('also names an action in the gate-met branch, which no REACHES row hits', () => {
    const met = stepFor(REACHES[7], 2, 2);
    expect(met.turn).toBe('nobody');
    expect(met.action.trim().length).toBeGreaterThan(30);
  });

  it('blocked_reason is non-null exactly when the turn is not the builder\'s', () => {
    for (const r of REACHES) {
      const step = stepFor(r);
      if (step.turn === 'owner') {
        expect(step.blocked_reason).not.toBeNull();
        expect((step.blocked_reason as string).trim().length).toBeGreaterThan(20);
      } else {
        expect(step.blocked_reason).toBeNull();
      }
    }
  });
});

describe('the fork Ali named as the missing piece', () => {
  it('api_only is the OWNER\'s turn and the action names the screen', () => {
    const step = nextStep(candidate({ product_state: 'api_only' }), NO_REQUESTS, 3);
    expect(step.turn).toBe('owner');
    expect(step.action).toMatch(/screen/i);
  });

  it('api_only NEVER sends the builder to write a scope sheet', () => {
    const step = nextStep(candidate({ product_state: 'api_only' }), NO_REQUESTS, 3);
    expect(step.action.toLowerCase()).not.toContain('scope sheet');
    expect((step.blocked_reason ?? '').toLowerCase()).not.toContain('scope sheet');
  });

  it('not_built DOES send them to write a scope sheet, which is the contrast', () => {
    const step = nextStep(candidate({ product_state: 'not_built' }), NO_REQUESTS, 3);
    expect(step.turn).toBe('builder');
    expect(step.action.toLowerCase()).toContain('scope sheet');
  });

  it('api_only names the matched feature when there is one', () => {
    const step = nextStep(
      candidate({ product_state: 'api_only', matched_feature_key: 'knowledge.edit' }),
      NO_REQUESTS,
      3,
    );
    expect(step.action).toContain('knowledge.edit');
  });

  it('partly asks for a RULING, not a screen, because the app does part of it', () => {
    const step = nextStep(candidate({ product_state: 'partly' }), NO_REQUESTS, 3);
    expect(step.turn).toBe('owner');
    expect(step.action.toLowerCase()).toContain('ruling');
    expect(step.action.toLowerCase()).not.toContain('scope sheet');
  });
});

describe('in_app with nothing proven is the builder\'s turn', () => {
  it('returns turn builder and tells them to do it by hand first', () => {
    const step = nextStep(
      candidate({ product_state: 'in_app', proven_by_hand_at: null }),
      NO_REQUESTS,
      3,
    );
    expect(step.turn).toBe('builder');
    expect(step.stage).toBe('by_hand_pending');
    expect(step.action.toLowerCase()).toContain('by hand');
    expect(step.blocked_reason).toBeNull();
  });

  it('does NOT ask them what they do by hand, which is the correction', () => {
    for (const r of REACHES) {
      const { action } = stepFor(r);
      expect(action).not.toMatch(/what do you do/i);
      expect(action).not.toMatch(/by hand\?/i);
    }
  });
});

describe('the gate size is used, not decorative', () => {
  it('counts down the remaining capabilities on the last stage', () => {
    const step = stepFor(REACHES[7], 5, 2);
    expect(step.turn).toBe('builder');
    expect(step.action).toContain('3 more');
  });

  it('says ONE capability in the singular', () => {
    expect(stepFor(REACHES[7], 3, 2).action).toContain('1 more capability ');
  });

  it('turns to nobody once the gate is met, and never goes negative', () => {
    const met = stepFor(REACHES[7], 2, 7);
    expect(met.turn).toBe('nobody');
    expect(met.action).not.toContain('-');
  });

  it('names the rung when one is given', () => {
    const step = nextStep(
      candidate({ proven_by_hand_at: new Date() }),
      { screen_status: null, tool_status: 'approved' },
      4,
      1,
      'R3',
    );
    expect(step.action).toContain('R3');
  });
});

describe('it is pure', () => {
  it('returns deeply equal output for a frozen input, called twice', () => {
    const c = Object.freeze(candidate({ product_state: 'api_only' }));
    const r = Object.freeze({ screen_status: null, tool_status: null }) as FlowRequests;
    const a = nextStep(c, r, 3, 1);
    const b = nextStep(c, r, 3, 1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('does not mutate its inputs', () => {
    const c = candidate({ product_state: 'partly' });
    const r: FlowRequests = { screen_status: 'submitted', tool_status: null };
    const cBefore = JSON.stringify(c);
    const rBefore = JSON.stringify(r);
    nextStep(Object.freeze(c), Object.freeze(r), 2, 0);
    expect(JSON.stringify(c)).toBe(cBefore);
    expect(JSON.stringify(r)).toBe(rBefore);
  });

  it('reads nothing outside its arguments: same args, same answer, in any order', () => {
    const rows = REACHES.map((r) => stepFor(r));
    const again = [...REACHES].reverse().map((r) => stepFor(r)).reverse();
    expect(again).toEqual(rows);
  });
});

describe('slugFor', () => {
  it('makes a stable, path-safe slug', () => {
    expect(slugFor('Draft the weekly intake summary')).toBe('draft-the-weekly-intake-summary');
    expect(slugFor('  Mixed: Case & Symbols!  ')).toBe('mixed-case-symbols');
  });

  it('never returns an empty slug, because an empty one collapses two artifact paths', () => {
    expect(slugFor('')).toBe('untitled');
    expect(slugFor('!!!')).toBe('untitled');
  });

  it('caps the length so a long title cannot make an unwritable path', () => {
    expect(slugFor('a'.repeat(400)).length).toBeLessThanOrEqual(60);
  });

  it('the artifact path carries the slug', () => {
    const step = nextStep(candidate({ title: 'Send the renewal notice' }), NO_REQUESTS, 1);
    expect(step.artifact_path).toContain('send-the-renewal-notice');
    expect(step.artifact_path).not.toContain('{slug}');
  });
});
