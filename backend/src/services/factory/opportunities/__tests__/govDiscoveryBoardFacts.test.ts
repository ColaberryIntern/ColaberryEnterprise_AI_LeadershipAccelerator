const listDismissed = jest.fn();
const listRestored = jest.fn();
jest.mock('../govOpportunityDismissals', () => ({ listActiveDismissedKeys: (...a: any[]) => listDismissed(...a), listRestoredKeys: (...a: any[]) => listRestored(...a) }));
const pipeline = jest.fn();
jest.mock('../../govPipeline', () => ({ listGovPipeline: (...a: any[]) => pipeline(...a), assignedOpportunityUuids: () => new Set(), resolveGovCloseDate: () => null }));
jest.mock('../../govOpportunityVetting', () => ({ STAGE_RANK: { a: 1, b: 2, c: 3 }, deriveVettingStage: (r: any) => ({ stage: r.stageFixture }) }));
const quals = jest.fn();
jest.mock('../../../../models/GovQualification', () => ({ __esModule: true, default: { findAll: (...a: any[]) => quals(...a) } }));
const vettings = jest.fn();
jest.mock('../../../../models/GovAiVetting', () => ({ __esModule: true, default: { findAll: (...a: any[]) => vettings(...a) } }));
const bundles = jest.fn();
jest.mock('../../../../models/GovSourceBundle', () => ({ __esModule: true, default: { findAll: (...a: any[]) => bundles(...a) } }));
jest.mock('../../../../config/featureFlags', () => ({ FLAGS: { govAiVetting: true } }));

import { loadBoardFacts, mergeQualFacts } from '../govDiscoveryBoardFacts';
import { rowsToHide } from '../govDiscoveryBoard';
import type { QualFacts } from '../govDiscoveryBoard';

const q = (over: Partial<QualFacts> = {}): QualFacts => ({ decision: 'pending_review', approvalRequested: false, establishedCount: 0, zipSha: null, title: null, agency: null, closeDate: null, ...over });
const row = (stageFixture: string, requirements_json: any = {}, decision = 'pending_review') => ({ canonical_opportunity_id: 'gws:u1', stageFixture, decision, requirements_json });

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  listDismissed.mockResolvedValue(new Set());
  listRestored.mockResolvedValue(new Set());
  pipeline.mockResolvedValue([]);
  quals.mockResolvedValue([]);
  vettings.mockResolvedValue([]);
  bundles.mockResolvedValue([]);
});

describe('mergeQualFacts', () => {
  it('keeps human progress from either entity', () => {
    const m = mergeQualFacts(q({ establishedCount: 0 }), q({ establishedCount: 5, approvalRequested: true }));
    expect(m).toMatchObject({ establishedCount: 5, approvalRequested: true });
  });
  it('a human decision on either entity stands', () => {
    expect(mergeQualFacts(q({ decision: 'needs_evidence' }), q({ decision: 'approved_bid_pursuit' })).decision).toBe('approved_bid_pursuit');
    expect(mergeQualFacts(q({ decision: 'approved_bid_pursuit' }), q({ decision: 'no_bid' })).decision).toBe('approved_bid_pursuit');
  });
  it('no_bid only stands when every entity declined', () => {
    expect(mergeQualFacts(q({ decision: 'no_bid' }), q({ decision: 'pending_review' })).decision).toBe('pending_review');
    expect(mergeQualFacts(q({ decision: 'no_bid' }), q({ decision: 'no_bid' })).decision).toBe('no_bid');
  });
});

describe('loadBoardFacts', () => {
  it('reports no failed reads on a clean load', async () => {
    expect((await loadBoardFacts('t')).failedReads?.size).toBe(0);
  });

  it.each([
    ['restored', listRestored], ['assigned', pipeline], ['qualifications', quals], ['vettings', vettings],
  ] as const)('a failed %s read is named, and the sweep then hides nothing', async (name, mock) => {
    mock.mockRejectedValue(new Error('db down'));
    const facts = await loadBoardFacts('t');
    expect(facts.failedReads?.has(name)).toBe(true);
    const low: any = { uuid: 'u1', title: 'Software', agency: 'City', closeDate: null, fitScore: 10, estimatedValue: 1, sourceUrl: null };
    expect(rowsToHide([low], facts)).toEqual([]);
  });

  it('a failed dismissal read throws, because hidden rows must never be guessed', async () => {
    listDismissed.mockRejectedValue(new Error('db down'));
    await expect(loadBoardFacts('t')).rejects.toThrow('db down');
  });

  it('two bidding entities: the established work on the less advanced one still protects the bid', async () => {
    quals.mockResolvedValue([
      row('c', {}, 'needs_evidence'),
      row('b', { established: [1, 2, 3, 4, 5] }),
    ]);
    expect((await loadBoardFacts('t')).qualifications.get('u1')).toMatchObject({ establishedCount: 5, decision: 'needs_evidence' });
  });

  it('the result does not depend on row order', async () => {
    const a = row('c', {}, 'needs_evidence');
    const b = row('b', { established: [1, 2] });
    quals.mockResolvedValue([a, b]);
    const first = (await loadBoardFacts('t')).qualifications.get('u1');
    quals.mockResolvedValue([b, a]);
    expect((await loadBoardFacts('t')).qualifications.get('u1')).toEqual(first);
  });
});
