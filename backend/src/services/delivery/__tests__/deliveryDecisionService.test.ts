/**
 * Contract tests for the decision ledger.
 *
 * The property under test: a settled decision is never rewritten. The difference between
 * "we changed our mind" and "we never said that" is the whole value of the ledger.
 */
jest.mock('../../../models/DeliveryDecision', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findAll: jest.fn(), create: jest.fn() },
}));

import DeliveryDecision from '../../../models/DeliveryDecision';
import {
  DecisionError,
  decide,
  getDecisionHistory,
  isSettled,
  openDecision,
  supersedeDecision,
} from '../deliveryDecisionService';

const M = DeliveryDecision as unknown as {
  findByPk: jest.Mock;
  findAll: jest.Mock;
  create: jest.Mock;
};

function row(overrides: Record<string, any> = {}): any {
  const r: any = {
    id: 'd1',
    delivery_project_id: 'p1',
    decision_type: 'design',
    question: 'Which navigation pattern?',
    final_decision: null,
    rationale: null,
    status: 'open',
    supersedes_decision_id: null,
    superseded_by_decision_id: null,
    decided_by_identity_id: null,
    decided_at: null,
    affected_nodes: null,
    ...overrides,
  };
  r.update = jest.fn(async (patch: Record<string, any>) => {
    Object.assign(r, patch);
    return r;
  });
  return r;
}

beforeEach(() => jest.clearAllMocks());

describe('opening a decision', () => {
  it('records the question before the answer', async () => {
    M.create.mockImplementation(async (v: any) => row(v));
    await openDecision({ deliveryProjectId: 'p1', decisionType: 'design', question: 'Q?' });

    expect(M.create).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Q?', status: 'open' }),
    );
  });

  it('a decision opened with a recommendation starts as recommended', async () => {
    M.create.mockImplementation(async (v: any) => row(v));
    await openDecision({
      deliveryProjectId: 'p1',
      decisionType: 'design',
      question: 'Q?',
      recommendation: 'Use a sidebar',
    });

    expect(M.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'recommended' }));
  });

  it('rejects an empty question', async () => {
    await expect(
      openDecision({ deliveryProjectId: 'p1', decisionType: 'design', question: '   ' }),
    ).rejects.toThrow(DecisionError);
  });
});

describe('deciding', () => {
  it('records the answer, rationale and decider', async () => {
    const d = row();
    M.findByPk.mockResolvedValue(d);

    await decide({ decisionId: 'd1', finalDecision: 'Sidebar', rationale: 'Fewer clicks', decidedByIdentityId: 'i1' });

    expect(d.final_decision).toBe('Sidebar');
    expect(d.rationale).toBe('Fewer clicks');
    expect(d.status).toBe('decided');
    expect(d.decided_at).toBeInstanceOf(Date);
  });

  it('a decision carrying a second-party approval is `approved`, not `decided`', async () => {
    const d = row();
    M.findByPk.mockResolvedValue(d);

    await decide({
      decisionId: 'd1',
      finalDecision: 'Sidebar',
      decidedByIdentityId: 'i1',
      approvedByIdentityId: 'i2',
    });

    expect(d.status).toBe('approved');
  });

  it('REFUSES to re-decide a settled decision — supersede instead', async () => {
    // An in-place edit erases the difference between changing your mind and never having
    // said it. That erasure is what master plan §24 calls a stop condition.
    M.findByPk.mockResolvedValue(row({ status: 'approved', final_decision: 'Sidebar' }));

    await expect(
      decide({ decisionId: 'd1', finalDecision: 'Top nav', decidedByIdentityId: 'i1' }),
    ).rejects.toThrow(/already_settled_supersede_instead/);
  });

  it('refuses to decide a superseded row', async () => {
    M.findByPk.mockResolvedValue(row({ status: 'superseded' }));
    await expect(
      decide({ decisionId: 'd1', finalDecision: 'X', decidedByIdentityId: 'i1' }),
    ).rejects.toThrow(DecisionError);
  });

  it('rejects an empty final decision', async () => {
    M.findByPk.mockResolvedValue(row());
    await expect(
      decide({ decisionId: 'd1', finalDecision: '  ', decidedByIdentityId: 'i1' }),
    ).rejects.toThrow(DecisionError);
  });
});

describe('supersession preserves both records', () => {
  it('creates a successor and links the prior, without rewriting what was decided', async () => {
    const prior = row({
      status: 'approved',
      final_decision: 'Sidebar',
      rationale: 'Fewer clicks',
      decided_by_identity_id: 'original-decider',
    });
    M.findByPk.mockResolvedValue(prior);
    M.create.mockImplementation(async (v: any) => row({ ...v, id: 'd2' }));

    const { prior: after, successor } = await supersedeDecision({
      priorDecisionId: 'd1',
      finalDecision: 'Top nav',
      decidedByIdentityId: 'new-decider',
    });

    // The prior decision keeps everything about what was decided.
    expect(after.final_decision).toBe('Sidebar');
    expect(after.rationale).toBe('Fewer clicks');
    expect(after.decided_by_identity_id).toBe('original-decider');
    // Only the link and the status changed.
    expect(after.status).toBe('superseded');
    expect(after.superseded_by_decision_id).toBe('d2');

    expect(successor.final_decision).toBe('Top nav');
    expect(successor.supersedes_decision_id).toBe('d1');
  });

  it('creates the successor BEFORE marking the prior superseded', async () => {
    // Order matters on failure: an orphaned successor is recoverable, whereas a prior
    // marked superseded by a row that was never created leaves no current decision.
    const prior = row({ status: 'approved' });
    M.findByPk.mockResolvedValue(prior);
    M.create.mockRejectedValue(new Error('db down'));

    await expect(
      supersedeDecision({ priorDecisionId: 'd1', finalDecision: 'X', decidedByIdentityId: 'i1' }),
    ).rejects.toThrow('db down');

    expect(prior.update).not.toHaveBeenCalled();
    expect(prior.status).toBe('approved');
  });

  it('inherits the prior question when none is given', async () => {
    M.findByPk.mockResolvedValue(row({ status: 'decided', question: 'Which nav?' }));
    M.create.mockImplementation(async (v: any) => row({ ...v, id: 'd2' }));

    const { successor } = await supersedeDecision({
      priorDecisionId: 'd1',
      finalDecision: 'Top nav',
      decidedByIdentityId: 'i1',
    });

    expect(successor.question).toBe('Which nav?');
  });

  it('refuses to supersede an UNSETTLED decision', async () => {
    // Nothing was decided yet, so there is nothing to supersede — just decide it.
    M.findByPk.mockResolvedValue(row({ status: 'open' }));
    await expect(
      supersedeDecision({ priorDecisionId: 'd1', finalDecision: 'X', decidedByIdentityId: 'i1' }),
    ).rejects.toThrow(/only_settled_decisions_are_superseded/);
  });

  it('refuses to supersede twice', async () => {
    M.findByPk.mockResolvedValue(row({ status: 'superseded' }));
    await expect(
      supersedeDecision({ priorDecisionId: 'd1', finalDecision: 'X', decidedByIdentityId: 'i1' }),
    ).rejects.toThrow(/already_superseded/);
  });
});

describe('decision history', () => {
  it('walks the chain oldest first', async () => {
    const first = row({ id: 'd1', final_decision: 'A' });
    const second = row({ id: 'd2', final_decision: 'B', supersedes_decision_id: 'd1' });
    const third = row({ id: 'd3', final_decision: 'C', supersedes_decision_id: 'd2' });
    M.findByPk.mockImplementation(async (id: string) =>
      ({ d1: first, d2: second, d3: third } as any)[id] ?? null,
    );

    const history = await getDecisionHistory('d3');
    expect(history.map((d) => d.final_decision)).toEqual(['A', 'B', 'C']);
  });

  it('a cycle terminates instead of hanging the request', async () => {
    const a = row({ id: 'd1', supersedes_decision_id: 'd2' });
    const b = row({ id: 'd2', supersedes_decision_id: 'd1' });
    M.findByPk.mockImplementation(async (id: string) => ({ d1: a, d2: b } as any)[id] ?? null);

    const history = await getDecisionHistory('d1');
    expect(history).toHaveLength(2);
  });

  it('a decision with no predecessor is a chain of one', async () => {
    M.findByPk.mockResolvedValue(row({ id: 'd1' }));
    expect(await getDecisionHistory('d1')).toHaveLength(1);
  });
});

describe('isSettled', () => {
  it.each([
    ['open', false],
    ['recommended', false],
    ['decided', true],
    ['approved', true],
    ['superseded', false],
  ])('%s → %s', (status, expected) => {
    expect(isSettled(status as any)).toBe(expected);
  });
});
