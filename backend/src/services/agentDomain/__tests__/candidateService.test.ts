/**
 * The candidate service, and the two things that would hurt if they were wrong.
 *
 * **1. Scoping.** Every read filters on the domain keys the caller owns. An EMPTY key list must
 * return nothing, never everything. Treating "no filter" as "no restriction" is how a scoping bug
 * becomes a disclosure, and the test asserts the table is not even queried in that case.
 *
 * **2. Silence versus zero.** An absent candidate list renders as `known: false` with a note, not
 * as `0 candidates`. `verificationSection` in `agentDomainSnapshot.ts` sets that precedent in its
 * own words, and a page that renders zero when the platform simply did not say is lying in the
 * quietest possible way.
 */

const mockCandidateFindAll = jest.fn();
const mockCandidateFindOne = jest.fn();
const mockCandidateFindOrCreate = jest.fn();
const mockRequestFindAll = jest.fn();

jest.mock('../../../models/AgentDomainCandidate', () => ({
  __esModule: true,
  default: {
    findAll: (...a: unknown[]) => mockCandidateFindAll(...a),
    findOne: (...a: unknown[]) => mockCandidateFindOne(...a),
    findOrCreate: (...a: unknown[]) => mockCandidateFindOrCreate(...a),
  },
}));
jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockRequestFindAll(...a) },
}));

import { Op } from 'sequelize';
import {
  candidatesSection,
  createCandidate,
  listCandidates,
  markProvenByHand,
  setProductState,
} from '../candidateService';

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cand-1',
    domain_key: 'admissions',
    title: 'Draft the weekly intake summary',
    source: 'manager',
    source_note: null,
    product_state: 'in_app',
    matched_feature_key: null,
    proven_by_hand_at: null,
    screen_request_id: null,
    tool_request_id: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCandidateFindAll.mockResolvedValue([]);
  mockRequestFindAll.mockResolvedValue([]);
});

describe('scoping', () => {
  it('an EMPTY key list returns nothing and does not query the table at all', async () => {
    const result = await listCandidates([]);
    expect(result.candidates).toEqual([]);
    expect(result.scoped_to_domains).toEqual([]);
    expect(mockCandidateFindAll).not.toHaveBeenCalled();
    // And it says why, so a builder sees an ownership gap rather than an empty page.
    expect(result.reason).toMatch(/org_members/);
    expect(result.reason).toMatch(/not a permissions problem/);
  });

  it('filters the query to exactly the keys it was given, de-duplicated and sorted', async () => {
    await listCandidates(['curriculum', 'admissions', 'curriculum']);
    const where = mockCandidateFindAll.mock.calls[0][0].where as Record<string, unknown>;
    const inClause = (where.domain_key as Record<symbol, unknown>)[Op.in as unknown as symbol];
    expect(inClause).toEqual(['admissions', 'curriculum']);
  });

  it('drops blank keys rather than passing them into the filter', async () => {
    const result = await listCandidates(['admissions', '', '   ']);
    expect(result.scoped_to_domains).toEqual(['admissions']);
  });

  it('a write is scoped at the QUERY, not after the fetch', async () => {
    mockCandidateFindOne.mockResolvedValue(null);
    await setProductState('cand-1', ['admissions'], 'in_app', null);
    const where = mockCandidateFindOne.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.id).toBe('cand-1');
    expect((where.domain_key as Record<symbol, unknown>)[Op.in as unknown as symbol]).toEqual(['admissions']);
  });

  it('a write with no owned domains never reaches the database', async () => {
    expect(await setProductState('cand-1', [], 'in_app', null)).toBeNull();
    expect(await markProvenByHand('cand-1', [], new Date())).toBeNull();
    expect(mockCandidateFindOne).not.toHaveBeenCalled();
  });
});

describe('the stage comes from a JOIN, never from a column', () => {
  it('resolves the statuses of both requests a candidate points at', async () => {
    mockCandidateFindAll.mockResolvedValue([
      row({ screen_request_id: 'req-s', tool_request_id: 'req-t', proven_by_hand_at: new Date() }),
    ]);
    mockRequestFindAll.mockResolvedValue([
      { id: 'req-s', status: 'approved' },
      { id: 'req-t', status: 'submitted' },
    ]);

    const result = await listCandidates(['admissions']);
    expect(result.candidates[0].screen_request_status).toBe('approved');
    expect(result.candidates[0].tool_request_status).toBe('submitted');
    // A submitted tool request outranks the by-hand proof, because Ali owes a decision.
    expect(result.candidates[0].step.stage).toBe('tool_requested');
    expect(result.candidates[0].step.turn).toBe('owner');
  });

  it('does not query the request table when no candidate points at one', async () => {
    mockCandidateFindAll.mockResolvedValue([row()]);
    await listCandidates(['admissions']);
    expect(mockRequestFindAll).not.toHaveBeenCalled();
  });

  it('a request id with no row resolves to null rather than to a guess', async () => {
    mockCandidateFindAll.mockResolvedValue([row({ tool_request_id: 'gone' })]);
    mockRequestFindAll.mockResolvedValue([]);
    const result = await listCandidates(['admissions']);
    expect(result.candidates[0].tool_request_status).toBeNull();
    expect(result.candidates[0].step.stage).toBe('by_hand_pending');
  });
});

describe('the gate countdown is a fact about the DOMAIN, not about one row', () => {
  it('every row in a domain sees the same cleared count', async () => {
    mockCandidateFindAll.mockResolvedValue([
      row({ id: 'a', title: 'A', tool_request_id: 'r1', proven_by_hand_at: new Date() }),
      row({ id: 'b', title: 'B', tool_request_id: 'r2', proven_by_hand_at: new Date() }),
      row({ id: 'c', title: 'C' }),
    ]);
    mockRequestFindAll.mockResolvedValue([
      { id: 'r1', status: 'approved' },
      { id: 'r2', status: 'approved' },
    ]);

    const result = await listCandidates(['admissions'], { admissions: 'R6' });
    // R6's gate is 4 and two are cleared, so both watched rows count down from the same number.
    const watched = result.candidates.filter((c) => c.step.stage === 'agent_watched');
    expect(watched).toHaveLength(2);
    expect(watched[0].step.action).toContain('2 more capabilities');
    expect(watched[1].step.action).toContain('2 more capabilities');
  });

  it('an unknown rung falls back to the SMALLEST gate, never a larger one', async () => {
    // A fallback that guessed high would make a domain look further from its gate than it is;
    // one that guessed low can only understate progress, which is the safer direction.
    mockCandidateFindAll.mockResolvedValue([row({ id: 'a', tool_request_id: 'r1' })]);
    mockRequestFindAll.mockResolvedValue([{ id: 'r1', status: 'approved' }]);
    const result = await listCandidates(['admissions']);
    expect(result.candidates[0].step.turn).toBe('nobody');
  });
});

describe('createCandidate', () => {
  it('uses findOrCreate on (domain_key, title), so a re-seed cannot double the list', async () => {
    mockCandidateFindOrCreate.mockResolvedValue([{ id: 'cand-9' }, true]);
    const out = await createCandidate({
      domain_key: 'admissions',
      title: 'A new candidate',
      source: 'suggested',
    });
    expect(out.created).toBe(true);
    const args = mockCandidateFindOrCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(args.where).toEqual({ domain_key: 'admissions', title: 'A new candidate' });
    const defaults = args.defaults as Record<string, unknown>;
    expect(defaults.product_state).toBe('unchecked');
    expect(defaults.proven_by_hand_at).toBeNull();
  });

  it('reports created: false on a repeat rather than claiming a new row', async () => {
    mockCandidateFindOrCreate.mockResolvedValue([{ id: 'cand-9' }, false]);
    expect((await createCandidate({
      domain_key: 'admissions', title: 'Already there', source: 'owner',
    })).created).toBe(false);
  });
});

describe('setProductState cleans the write the CHECK constraint would refuse', () => {
  it('clears matched_feature_key when the state goes back to unchecked', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockCandidateFindOne.mockResolvedValue({ id: 'cand-1', product_state: 'unchecked', update });
    await setProductState('cand-1', ['admissions'], 'unchecked', 'landing_page.draft');
    expect(update.mock.calls[0][0].matched_feature_key).toBeNull();
  });

  it('keeps it when the state is a real answer', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockCandidateFindOne.mockResolvedValue({ id: 'cand-1', product_state: 'api_only', update });
    await setProductState('cand-1', ['admissions'], 'api_only', 'knowledge.edit');
    expect(update.mock.calls[0][0].matched_feature_key).toBe('knowledge.edit');
  });
});

describe('candidatesSection: silence and zero are different answers', () => {
  it('an ABSENT list renders known: false with a note, never an empty list of candidates', () => {
    const section = candidatesSection(undefined);
    expect(section.known).toBe(false);
    expect(String(section.note)).toMatch(/did not supply/);
    expect(String(section.note)).toMatch(/do not render\s+zero/);
    expect(section.summary).toBeUndefined();
  });

  it('an EMPTY list renders known: true with a zero summary and a reason', () => {
    const section = candidatesSection({
      candidates: [], scoped_to_domains: ['admissions'], reason: 'nobody has proposed anything',
    });
    expect(section.known).toBe(true);
    expect((section.summary as Record<string, number>).candidates).toBe(0);
    expect(String(section.reason).length).toBeGreaterThan(10);
  });

  it('counts by TURN, which is the headline the section exists for', async () => {
    mockCandidateFindAll.mockResolvedValue([
      row({ id: 'a', title: 'A', product_state: 'api_only' }),
      row({ id: 'b', title: 'B', product_state: 'in_app' }),
      row({ id: 'c', title: 'C', tool_request_id: 'r1' }),
    ]);
    mockRequestFindAll.mockResolvedValue([{ id: 'r1', status: 'approved' }]);
    const result = await listCandidates(['admissions'], { admissions: 'R0' });
    const summary = candidatesSection(result).summary as Record<string, number>;
    expect(summary.candidates).toBe(3);
    expect(summary.waiting_on_the_owner).toBe(1);
    expect(summary.yours_to_move).toBe(1);
    expect(summary.finished).toBe(1);
    expect(summary.cleared_the_gate).toBe(1);
  });

  it('every rendered candidate carries the sentence and the artifact, not just a status', () => {
    const section = candidatesSection({
      scoped_to_domains: ['admissions'],
      reason: 'one candidate',
      candidates: [{
        id: 'a',
        domain_key: 'admissions',
        title: 'A',
        source: 'owner',
        source_note: null,
        product_state: 'api_only',
        matched_feature_key: null,
        proven_by_hand_at: null,
        screen_request_id: null,
        screen_request_status: null,
        tool_request_id: null,
        tool_request_status: null,
        step: {
          stage: 'platform_owed',
          turn: 'owner',
          action: 'Ali owes you the screen.',
          blocked_reason: 'Ali owes you the screen.',
          artifact_path: 'artifacts/capability/a/20-what-is-missing.md',
        },
      }],
    });
    const first = (section.candidates as Array<Record<string, unknown>>)[0];
    expect(first.action).toBe('Ali owes you the screen.');
    expect(first.artifact_path).toBe('artifacts/capability/a/20-what-is-missing.md');
    expect(first.blocked_reason).not.toBeNull();
    // No decision field anywhere in the rendered row: the spine holds decisions, not this.
    expect(Object.keys(first).filter((k) => /status|approv|declin|decided/.test(k))).toEqual([]);
  });
});
