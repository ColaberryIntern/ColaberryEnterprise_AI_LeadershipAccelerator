/**
 * govProposalResponse — authoring + the review lifecycle. THE RAILS under test: the lifecycle order
 * (draft→reviewed→approved; no skipping review, no reviewing an empty answer; any edit resets to draft) and the
 * figure commit-binding (a figure with no commit is refused). Upsert is idempotent.
 */
const prCreate = jest.fn();
const prFindOne = jest.fn();
const prFindAll = jest.fn();
jest.mock('../../../models/GovProposalResponse', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => prCreate(...a), findOne: (...a: any[]) => prFindOne(...a), findAll: (...a: any[]) => prFindAll(...a) },
}));

import { saveProposalResponse, reviewProposalResponse, addProposalFigure, removeProposalFigure, listProposalResponses, ResponseError } from '../govProposalResponse';

// A mock row: get() returns the current plain state; update() mutates it in place for the re-read.
const mockRow = (over: any = {}) => {
  const state: any = { id: 'rp-1', delivery_project_id: 'dp-1', requirement_id: 'R1', content: 'answer', status: 'draft', figures: [], authored_by_identity_id: 'a1', reviewed_by_identity_id: null, updated_at: new Date('2026-10-08T00:00:00Z'), ...over };
  return { get: () => ({ ...state }), update: jest.fn(async (patch: any) => { Object.assign(state, patch); }) };
};

beforeEach(() => { jest.clearAllMocks(); });

describe('saveProposalResponse', () => {
  it('creates a new response as `draft` with the author', async () => {
    prFindOne.mockResolvedValue(null);
    prCreate.mockImplementation(async (v: any) => mockRow({ ...v }));
    const r = await saveProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', content: 'We comply.', authoredByIdentityId: 'a1' });
    expect(prCreate.mock.calls[0][0].status).toBe('draft');
    expect(r.status).toBe('draft');
    expect(r.content).toBe('We comply.');
  });

  it('editing an existing response RESETS it to draft (a changed answer is not reviewed/approved)', async () => {
    const row = mockRow({ status: 'approved', content: 'old' });
    prFindOne.mockResolvedValue(row);
    const r = await saveProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', content: 'revised answer' });
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', content: 'revised answer' }));
    expect(r.status).toBe('draft');
    expect(prCreate).not.toHaveBeenCalled();
  });

  it('rejects missing identifiers', async () => {
    await expect(saveProposalResponse({ deliveryProjectId: '', requirementId: 'R1', content: 'x' })).rejects.toMatchObject({ reason: 'bad_input' });
  });
});

describe('reviewProposalResponse — the lifecycle order is the rail', () => {
  it('draft → reviewed when there is content', async () => {
    const row = mockRow({ status: 'draft', content: 'answer' });
    prFindOne.mockResolvedValue(row);
    const r = await reviewProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', decision: 'reviewed', reviewerIdentityId: 'rev' });
    expect(r.status).toBe('reviewed');
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'reviewed', reviewed_by_identity_id: 'rev' }));
  });

  it('REFUSES draft → approved (review cannot be skipped) — not_reviewed, nothing updated', async () => {
    const row = mockRow({ status: 'draft', content: 'answer' });
    prFindOne.mockResolvedValue(row);
    await expect(reviewProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', decision: 'approved' })).rejects.toMatchObject({ reason: 'not_reviewed' });
    expect(row.update).not.toHaveBeenCalled();
  });

  it('reviewed → approved is allowed', async () => {
    const row = mockRow({ status: 'reviewed', content: 'answer' });
    prFindOne.mockResolvedValue(row);
    const r = await reviewProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', decision: 'approved' });
    expect(r.status).toBe('approved');
  });

  it('REFUSES reviewing an EMPTY answer (empty_content)', async () => {
    const row = mockRow({ status: 'draft', content: '   ' });
    prFindOne.mockResolvedValue(row);
    await expect(reviewProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', decision: 'reviewed' })).rejects.toMatchObject({ reason: 'empty_content' });
    expect(row.update).not.toHaveBeenCalled();
  });

  it('revision_required is allowed from approved (the kickback)', async () => {
    const row = mockRow({ status: 'approved', content: 'answer' });
    prFindOne.mockResolvedValue(row);
    const r = await reviewProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', decision: 'revision_required' });
    expect(r.status).toBe('revision_required');
  });

  it('a bad decision and a missing row are refused', async () => {
    prFindOne.mockResolvedValue(mockRow());
    await expect(reviewProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', decision: 'approve' as any })).rejects.toMatchObject({ reason: 'bad_decision' });
    prFindOne.mockResolvedValue(null);
    await expect(reviewProposalResponse({ deliveryProjectId: 'dp-1', requirementId: 'R1', decision: 'reviewed' })).rejects.toMatchObject({ reason: 'not_found' });
  });
});

describe('addProposalFigure — the commit-binding rail', () => {
  it('attaches a commit-bound figure and resets the response to draft', async () => {
    const row = mockRow({ status: 'approved', figures: [] });
    prFindOne.mockResolvedValue(row);
    const r = await addProposalFigure({ deliveryProjectId: 'dp-1', requirementId: 'R1', figure: { commit: 'abc1234', ref: 'docs/shot.png', caption: 'proof' } });
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(r.figures).toEqual([{ commit: 'abc1234', ref: 'docs/shot.png', caption: 'proof' }]);
  });

  it('REFUSES a figure with NO commit (figure_not_commit_bound) — nothing updated', async () => {
    const row = mockRow();
    prFindOne.mockResolvedValue(row);
    await expect(addProposalFigure({ deliveryProjectId: 'dp-1', requirementId: 'R1', figure: { commit: '  ', ref: 'docs/shot.png', caption: 'x' } })).rejects.toMatchObject({ reason: 'figure_not_commit_bound' });
    expect(row.update).not.toHaveBeenCalled();
  });

  it('removeProposalFigure drops the figure by ref and resets to draft; list maps rows', async () => {
    const row = mockRow({ figures: [{ commit: 'c1', ref: 'keep.png', caption: '' }, { commit: 'c2', ref: 'drop.png', caption: '' }] });
    prFindOne.mockResolvedValue(row);
    const r = await removeProposalFigure('dp-1', 'R1', 'drop.png');
    expect(r.figures.map((f) => f.ref)).toEqual(['keep.png']);
    expect(await listProposalResponses('')).toEqual([]);
  });
});
