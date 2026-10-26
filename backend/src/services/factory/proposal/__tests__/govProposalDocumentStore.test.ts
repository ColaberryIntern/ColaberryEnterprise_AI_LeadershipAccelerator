/**
 * govProposalDocumentStore rails: sync updates SOURCE-derived fields only (never content/status/version/acceptance,
 * so re-derivation can't wipe a drafted document); saveDraft ALWAYS lands `drafted` (the maker never self-accepts)
 * and reopens an accepted doc; accept is reviewer-set and requires content; request-changes appends a note.
 */
const findOrCreate = jest.fn();
const findAll = jest.fn();
const findOne = jest.fn();
jest.mock('../../../../models/GovProposalDocument', () => ({ __esModule: true, default: { findOrCreate: (...a: any[]) => findOrCreate(...a), findAll: (...a: any[]) => findAll(...a), findOne: (...a: any[]) => findOne(...a) } }));

import { syncProposalDocuments, saveProposalDocumentDraft, acceptProposalDocument, requestChangesProposalDocument, addProposalDocumentComment } from '../govProposalDocumentStore';

const rowState = (init: any = {}) => {
  const s: any = { id: 'd1', delivery_project_id: 'dp-1', doc_key: 'technical', title: 'Technical Proposal', status: 'not_started', content_html: null, version: 0, admin_only: false, gate: false, order_index: 11, requirement_ids: [], comments: [], drafted_at: null, drafted_by_identity_id: null, accepted_at: null, accepted_by_identity_id: null, ...init };
  const row: any = { get: () => ({ ...s }), update: jest.fn(async (p: any) => { Object.assign(s, p); return row; }) };
  return row;
};

beforeEach(() => { jest.clearAllMocks(); });

describe('syncProposalDocuments', () => {
  it('updates ONLY source-derived fields on an existing doc — never content/status/version', async () => {
    const row = rowState({ status: 'drafted', content_html: '<p>draft</p>', version: 2, requirement_ids: ['R0'] });
    findOrCreate.mockResolvedValue([row, false]);
    findAll.mockResolvedValue([row]);
    await syncProposalDocuments('dp-1', [{ key: 'technical', title: 'Technical Proposal', order: 11, gate: true, adminOnly: false, requirements: [{ canonicalReqId: 'R1', statement: 'x' }, { canonicalReqId: 'R2', statement: 'y' }] }]);
    const patch = row.update.mock.calls[0][0];
    expect(patch).toMatchObject({ title: 'Technical Proposal', gate: true, requirement_ids: ['R1', 'R2'] });
    expect(patch.content_html).toBeUndefined();
    expect(patch.status).toBeUndefined();
    expect(patch.version).toBeUndefined();
  });

  it('a newly-created doc keeps its defaults (no update call)', async () => {
    const row = rowState();
    findOrCreate.mockResolvedValue([row, true]);
    findAll.mockResolvedValue([row]);
    await syncProposalDocuments('dp-1', [{ key: 'technical', title: 'Technical Proposal', order: 11, gate: false, adminOnly: false, requirements: [] }]);
    expect(row.update).not.toHaveBeenCalled();
  });
});

describe('saveProposalDocumentDraft', () => {
  it('always lands `drafted`, bumps the version, and REOPENS an accepted doc (acceptance cleared)', async () => {
    const row = rowState({ status: 'accepted', version: 3, content_html: 'old', accepted_at: new Date(), accepted_by_identity_id: 'r' });
    findOne.mockResolvedValue(row);
    const v = await saveProposalDocumentDraft('dp-1', 'technical', '<p>new</p>', 'me-1');
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'drafted', version: 4, content_html: '<p>new</p>', accepted_at: null, accepted_by_identity_id: null }));
    expect(v.status).toBe('drafted');
  });
  it('rejects empty content before any DB read', async () => {
    await expect(saveProposalDocumentDraft('dp-1', 'technical', '   ', 'me')).rejects.toMatchObject({ reason: 'empty' });
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('acceptProposalDocument — reviewer-only path to accepted', () => {
  it('accepts a drafted doc with content', async () => {
    findOne.mockResolvedValue(rowState({ status: 'drafted', content_html: '<p>x</p>' }));
    const v = await acceptProposalDocument('dp-1', 'technical', 'reviewer-1');
    expect(v.status).toBe('accepted');
    expect(v.acceptedAt).not.toBeNull();
  });
  it('refuses to accept a doc with no draft, and refuses to re-accept', async () => {
    findOne.mockResolvedValueOnce(rowState({ status: 'not_started', content_html: null }));
    await expect(acceptProposalDocument('dp-1', 'technical', 'r')).rejects.toMatchObject({ reason: 'not_drafted' });
    findOne.mockResolvedValueOnce(rowState({ status: 'accepted', content_html: '<p>x</p>' }));
    await expect(acceptProposalDocument('dp-1', 'technical', 'r')).rejects.toMatchObject({ reason: 'already_accepted' });
  });
});

describe('request-changes + comment', () => {
  it('request-changes sets changes_requested and appends the note to the thread', async () => {
    findOne.mockResolvedValue(rowState({ status: 'drafted', content_html: '<p>x</p>', comments: [] }));
    const v = await requestChangesProposalDocument('dp-1', 'technical', 'reviewer-1', 'please fix section 2');
    expect(v.status).toBe('changes_requested');
    expect(v.comments[v.comments.length - 1]).toMatchObject({ body: 'please fix section 2' });
  });
  it('comment appends without changing status; rejects empty', async () => {
    findOne.mockResolvedValue(rowState({ status: 'drafted', content_html: '<p>x</p>', comments: [] }));
    const v = await addProposalDocumentComment('dp-1', 'technical', 'me-1', 'looks good');
    expect(v.status).toBe('drafted');
    expect(v.comments[v.comments.length - 1]).toMatchObject({ body: 'looks good' });
    await expect(addProposalDocumentComment('dp-1', 'technical', 'me-1', '  ')).rejects.toMatchObject({ reason: 'empty' });
  });
});
