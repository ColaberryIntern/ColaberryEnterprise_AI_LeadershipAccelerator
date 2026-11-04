/**
 * govProposalReviewStore — versions are insert-only (never updated), a new version reopens the gates, and gate
 * approval enforces order + the pass-the-relevant-checks rule + Gold separation of duties (the AI can't approve; the
 * last human author can't approve their own Gold, unless a master-admin override).
 */
const docFindByPk = jest.fn();
const docFindOne = jest.fn();
const docUpdate = jest.fn();
const verFindOne = jest.fn();
const verCreate = jest.fn();
const verFindByPk = jest.fn();
const verFindAll = jest.fn();
const verUpdate = jest.fn();
const gateFindOrCreate = jest.fn();
const gateFindAll = jest.fn();
const gateUpdate = jest.fn();

jest.mock('../../../../models/GovProposalDocument', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => docFindByPk(...a), findOne: (...a: any[]) => docFindOne(...a), update: (...a: any[]) => docUpdate(...a) } }));
jest.mock('../../../../models/GovProposalDocumentVersion', () => ({ __esModule: true, default: { findOne: (...a: any[]) => verFindOne(...a), create: (...a: any[]) => verCreate(...a), findByPk: (...a: any[]) => verFindByPk(...a), findAll: (...a: any[]) => verFindAll(...a), update: (...a: any[]) => verUpdate(...a) } }));
jest.mock('../../../../models/GovProposalGateReview', () => ({ __esModule: true, default: { findOrCreate: (...a: any[]) => gateFindOrCreate(...a), findAll: (...a: any[]) => gateFindAll(...a), update: (...a: any[]) => gateUpdate(...a) } }));

import { createDocumentVersion, versionPassesGate, decideGate, ProposalReviewError } from '../govProposalReviewStore';
import type { CheckScores } from '../proposalReviewTypes';

const plain = (v: any) => ({ get: () => ({ ...v }) });
const scoreAll = (n: number): CheckScores => ({ coverage: n, format: n, fact: n, evaluator: n, proof: n, clarity: n });

beforeEach(() => { jest.clearAllMocks(); });

describe('createDocumentVersion — insert-only + reopen gates', () => {
  it('inserts last+1, points current_version_id at it, and resets the gates to pending', async () => {
    verFindOne.mockResolvedValue({ version: 2 });
    verCreate.mockResolvedValue({ id: 'v3' });
    docUpdate.mockResolvedValue([1]);
    gateUpdate.mockResolvedValue([1]);
    const r = await createDocumentVersion('doc-1', { contentHtml: '<p>x</p>', sections: [], authorKind: 'agent', authorIdentityId: 'a', changeSummary: 's' });
    expect(r).toEqual({ id: 'v3', version: 3 });
    expect(verCreate).toHaveBeenCalledWith(expect.objectContaining({ document_id: 'doc-1', version: 3 }));
    expect(docUpdate).toHaveBeenCalledWith({ current_version_id: 'v3' }, { where: { id: 'doc-1' } });
    expect(gateUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', version_id: null }), { where: { document_id: 'doc-1' } });
  });
});

describe('versionPassesGate (pure)', () => {
  it('pink opens on coverage+fact floors; a low evaluator does not block pink', () => {
    expect(versionPassesGate({ ...scoreAll(100), evaluator: 10 }, [], 'pink')).toBe(true);
    expect(versionPassesGate({ ...scoreAll(100), coverage: 80 }, [], 'pink')).toBe(false); // coverage below floor
  });
  it('gold needs the full pass rule (weighted >= 95 and every relevant floor)', () => {
    expect(versionPassesGate(scoreAll(95), [], 'gold')).toBe(true);
    expect(versionPassesGate({ ...scoreAll(95), proof: 80 }, [], 'gold')).toBe(false);
  });
  it('a fatal finding in a relevant check blocks the gate', () => {
    expect(versionPassesGate(scoreAll(100), [{ check: 'format', severity: 'fatal', message: 'x' }], 'white_glove')).toBe(false);
  });
});

describe('decideGate', () => {
  const docId = 'doc-1';
  const armGates = (statuses: Record<string, string>) => gateFindAll.mockResolvedValue(
    Object.entries(statuses).map(([gate, status]) => plain({ gate, status, version_id: 'vX', note: null, decided_at: null })),
  );
  const armVersion = (over: any = {}) => verFindByPk.mockResolvedValue(plain({ id: 'vX', check_scores: scoreAll(95), findings: [], author_kind: 'human', author_identity_id: 'author-1', ...over }));

  beforeEach(() => {
    docFindByPk.mockResolvedValue({ id: docId, current_version_id: 'vX' });
    gateFindOrCreate.mockResolvedValue([{ update: jest.fn() }, false]);
  });

  it('refuses to approve a gate before the earlier gate is approved', async () => {
    armGates({ pink: 'pending', red: 'pending', gold: 'pending', white_glove: 'pending' });
    armVersion();
    await expect(decideGate({ documentId: docId, gate: 'red', reviewerIdentityId: 'r', decision: 'approve' })).rejects.toMatchObject({ reason: 'gate_order' });
  });

  it('refuses when the version does not pass the gate checks', async () => {
    armGates({ pink: 'pending' });
    armVersion({ check_scores: { ...scoreAll(95), coverage: 50 } });
    await expect(decideGate({ documentId: docId, gate: 'pink', reviewerIdentityId: 'r', decision: 'approve' })).rejects.toMatchObject({ reason: 'checks_not_met' });
  });

  it('Gold: the last human author cannot approve their own version (separation of duties)', async () => {
    armGates({ pink: 'approved', red: 'approved', gold: 'pending', white_glove: 'pending' });
    armVersion({ author_kind: 'human', author_identity_id: 'author-1' });
    await expect(decideGate({ documentId: docId, gate: 'gold', reviewerIdentityId: 'author-1', decision: 'approve' })).rejects.toMatchObject({ reason: 'separation_of_duties' });
  });

  it('Gold: a master-admin override lets the author approve', async () => {
    armGates({ pink: 'approved', red: 'approved', gold: 'pending', white_glove: 'pending' });
    armVersion({ author_kind: 'human', author_identity_id: 'author-1' });
    await decideGate({ documentId: docId, gate: 'gold', reviewerIdentityId: 'author-1', decision: 'approve', isMasterAdmin: true });
    expect(gateFindOrCreate).toHaveBeenCalled(); // reached the approval write
  });

  it('a reviewer who is not the author approves Gold on a passing version', async () => {
    armGates({ pink: 'approved', red: 'approved', gold: 'pending', white_glove: 'pending' });
    armVersion({ author_identity_id: 'author-1' });
    await decideGate({ documentId: docId, gate: 'gold', reviewerIdentityId: 'reviewer-2', decision: 'approve' });
    expect(gateFindOrCreate).toHaveBeenCalled();
  });

  it('a return decision is allowed without the pass checks', async () => {
    armGates({ pink: 'pending' });
    armVersion({ check_scores: scoreAll(10) });
    await decideGate({ documentId: docId, gate: 'pink', reviewerIdentityId: 'r', decision: 'return', note: 'fix section 2' });
    expect(gateFindOrCreate).toHaveBeenCalled();
  });

  it('requires a reviewer identity', async () => {
    await expect(decideGate({ documentId: docId, gate: 'pink', reviewerIdentityId: null, decision: 'approve' })).rejects.toBeInstanceOf(ProposalReviewError);
  });
});
