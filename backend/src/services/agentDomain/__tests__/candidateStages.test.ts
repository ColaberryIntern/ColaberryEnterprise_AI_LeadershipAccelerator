/**
 * The eight stages and the totality of `derive`.
 *
 * The property worth testing here is not that the obvious cases work. It is that **there is no
 * input for which `derive` has no answer.** A stage function that returns `undefined` for one
 * combination nobody thought of does not fail loudly: it renders an empty cell on the admin board
 * and reads as "nothing to do", which is exactly the wrong thing to tell somebody whose turn it
 * is. So the cross-product is enumerated rather than sampled.
 */

import {
  CANDIDATE_PRODUCT_STATES,
  type CandidateProductState,
} from '../../../db/ensureAgentDomainCandidateSchema';
import { TOOL_PRODUCT_STATES } from '../../../db/ensureAgentDomainToolRequestSchema';
import type { AgentChangeRequestStatus } from '../agentChangeRequest';
import { PRODUCT_FEATURES, answerFrontDoor } from '../productFeatureCatalog';
import {
  CANDIDATE_STAGES,
  type CandidateStage,
  countsTowardGate,
  derive,
  isOwnerTurn,
} from '../candidateStages';

/**
 * Absence plus every real status. FIVE values, not the four the plan first estimated.
 *
 * `AgentChangeRequestStatus` is `submitted | approved | declined | withdrawn`, and a candidate that
 * points at no request at all is a fifth state. The honest grid is therefore 5 x 5 x 5 = 125, not
 * 5 x 4 x 4 = 80. Enumerating fewer than the real set is how a totality test certifies totality it
 * never checked.
 */
const REQUEST_STATES: ReadonlyArray<AgentChangeRequestStatus | null> = [
  null,
  'submitted',
  'approved',
  'declined',
  'withdrawn',
];

const PROVEN: ReadonlyArray<Date | null> = [null, new Date('2026-11-19T06:00:00Z')];

function everyInput(): Array<{
  product_state: CandidateProductState;
  proven_by_hand_at: Date | null;
  screen_request_status: AgentChangeRequestStatus | null;
  tool_request_status: AgentChangeRequestStatus | null;
}> {
  const out = [];
  for (const product_state of CANDIDATE_PRODUCT_STATES) {
    for (const proven_by_hand_at of PROVEN) {
      for (const screen_request_status of REQUEST_STATES) {
        for (const tool_request_status of REQUEST_STATES) {
          out.push({
            product_state,
            proven_by_hand_at,
            screen_request_status,
            tool_request_status,
          });
        }
      }
    }
  }
  return out;
}

describe('the eight stages', () => {
  it('is exactly eight, frozen, with no duplicates', () => {
    expect(CANDIDATE_STAGES).toHaveLength(8);
    expect(new Set(CANDIDATE_STAGES).size).toBe(8);
    expect(Object.isFrozen(CANDIDATE_STAGES)).toBe(true);
  });

  it('cannot be mutated by a caller', () => {
    expect(() => {
      (CANDIDATE_STAGES as unknown as string[]).push('sneaky');
    }).toThrow();
    expect(CANDIDATE_STAGES).toHaveLength(8);
  });

  it('carries no stage that expresses a decision', () => {
    for (const s of CANDIDATE_STAGES) {
      expect(s).not.toMatch(/approved|declined|rejected|denied/);
    }
  });
});

describe('derive is TOTAL', () => {
  const inputs = everyInput();

  it('enumerates the full cross-product, which is 5 x 2 x 5 x 5', () => {
    expect(inputs).toHaveLength(250);
  });

  it('returns a member of CANDIDATE_STAGES for every single input', () => {
    const bad: string[] = [];
    for (const input of inputs) {
      const stage = derive(input);
      if (stage === undefined || !CANDIDATE_STAGES.includes(stage)) {
        bad.push(`${JSON.stringify(input)} -> ${String(stage)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('reaches every one of the eight stages from some real input', () => {
    const reached = new Set<CandidateStage>(inputs.map(derive));
    expect([...reached].sort()).toEqual([...CANDIDATE_STAGES].sort());
  });

  it('is deterministic and does not mutate its input', () => {
    for (const input of inputs.slice(0, 40)) {
      const frozen = Object.freeze({ ...input });
      const a = derive(frozen);
      const b = derive(frozen);
      expect(a).toBe(b);
      expect(frozen).toEqual(input);
    }
  });
});

describe('the order the stages outrank each other', () => {
  const base = {
    product_state: 'in_app' as CandidateProductState,
    proven_by_hand_at: null,
    screen_request_status: null,
    tool_request_status: null,
  };

  it('an approved tool request outranks everything, including the by-hand proof', () => {
    expect(derive({
      ...base,
      proven_by_hand_at: new Date(),
      screen_request_status: 'submitted',
      tool_request_status: 'approved',
    })).toBe('agent_watched');
  });

  it('a submitted tool request outranks the by-hand proof, because Ali owes a decision', () => {
    expect(derive({ ...base, proven_by_hand_at: new Date(), tool_request_status: 'submitted' }))
      .toBe('tool_requested');
  });

  it('a DECLINED tool request leaves the candidate where it was, not in a decline stage', () => {
    expect(derive({ ...base, proven_by_hand_at: new Date(), tool_request_status: 'declined' }))
      .toBe('proven_by_hand');
    expect(derive({ ...base, tool_request_status: 'declined' })).toBe('by_hand_pending');
  });

  it('a WITHDRAWN request behaves the same way, because neither is a stage here', () => {
    expect(derive({ ...base, proven_by_hand_at: new Date(), tool_request_status: 'withdrawn' }))
      .toBe('proven_by_hand');
  });

  it('an approved screen request means the builder owes a session using it', () => {
    expect(derive({ ...base, product_state: 'api_only', screen_request_status: 'approved' }))
      .toBe('screen_built');
  });

  it('a submitted screen request is Ali\'s turn whatever the product state says', () => {
    expect(derive({ ...base, screen_request_status: 'submitted' })).toBe('platform_owed');
  });
});

describe('where a candidate starts when nothing has happened yet', () => {
  const untouched = (product_state: CandidateProductState) => derive({
    product_state,
    proven_by_hand_at: null,
    screen_request_status: null,
    tool_request_status: null,
  });

  it.each([
    ['unchecked', 'proposed'],
    ['in_app', 'by_hand_pending'],
    ['partly', 'platform_owed'],
    ['api_only', 'platform_owed'],
    ['not_built', 'scope_sheet_owed'],
  ] as Array<[CandidateProductState, CandidateStage]>)(
    '%s starts at %s',
    (state, expected) => expect(untouched(state)).toBe(expected),
  );

  it('api_only is OWED BY ALI, which is the fork, not something the builder can clear', () => {
    expect(isOwnerTurn(untouched('api_only'))).toBe(true);
    expect(isOwnerTurn(untouched('not_built'))).toBe(false);
  });
});

describe('what counts toward a rung gate', () => {
  it('only the agent doing it watched, never the by-hand proof', () => {
    expect(countsTowardGate('agent_watched')).toBe(true);
    expect(countsTowardGate('proven_by_hand')).toBe(false);
    expect(CANDIDATE_STAGES.filter(countsTowardGate)).toEqual(['agent_watched']);
  });

  it('exactly two stages are the owner\'s turn', () => {
    expect(CANDIDATE_STAGES.filter(isOwnerTurn)).toEqual(['platform_owed', 'tool_requested']);
  });
});

/**
 * THE TWO PRODUCT VOCABULARIES ARE BRIDGED, NOT CONFLATED.
 *
 * `CANDIDATE_PRODUCT_STATES` says what the PRODUCT has. `TOOL_PRODUCT_STATES` says what the
 * BUILDER has tried. They are different words for different questions, and the only crossing
 * between them is `answerFrontDoor().implies_tried_in_product`.
 *
 * If that crossing ever returned a word outside `TOOL_PRODUCT_STATES`, a filed tool request would
 * carry a `tried_in_product` value `chk_adtr_build_request_is_unbuilt` rejects, and the failure
 * would land on a builder filling in a form rather than here.
 */
describe('the bridge between the two product vocabularies', () => {
  const ALLOWED: ReadonlyArray<string | null> = [null, ...TOOL_PRODUCT_STATES];

  it('every catalog feature answers with a tried_in_product the tool table accepts', () => {
    const seen = new Set<string>();
    for (const f of PRODUCT_FEATURES) {
      const answer = answerFrontDoor({ candidate: f.label, domainKey: f.domain_key });
      seen.add(answer.state);
      expect(ALLOWED).toContain(answer.implies_tried_in_product);
    }
    // The sweep has to actually exercise more than one state, or it proves nothing.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('an unmatched candidate also answers inside the tool table\'s vocabulary', () => {
    const answer = answerFrontDoor({
      candidate: 'something nobody has ever curated for this domain',
      domainKey: PRODUCT_FEATURES[0].domain_key,
    });
    expect(answer.state).toBe('not_built');
    expect(ALLOWED).toContain(answer.implies_tried_in_product);
  });

  it('an unmapped domain answers inside it too', () => {
    const answer = answerFrontDoor({ candidate: 'anything', domainKey: 'no.such.domain' });
    expect(answer.domain_is_mapped).toBe(false);
    expect(ALLOWED).toContain(answer.implies_tried_in_product);
  });

  it('every front-door state except unchecked is a candidate product state', () => {
    const states = new Set(PRODUCT_FEATURES.map((f) => f.state as string));
    states.add('not_built');
    for (const s of states) expect(CANDIDATE_PRODUCT_STATES).toContain(s);
  });

  it('the two vocabularies are NOT the same list, which is the point', () => {
    expect([...CANDIDATE_PRODUCT_STATES].sort()).not.toEqual([...TOOL_PRODUCT_STATES].sort());
    expect(CANDIDATE_PRODUCT_STATES).not.toContain('used_by_hand');
    expect(TOOL_PRODUCT_STATES).not.toContain('in_app');
  });
});
