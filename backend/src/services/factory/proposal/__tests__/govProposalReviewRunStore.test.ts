/**
 * govProposalReviewRunStore + ensureGovProposalReviewRunsSchema (Proposal Studio B.5). The model + the sequelize
 * config are mocked; the store's logic (create running, enforce-able active lookup, terminal finished_at stamping,
 * batch latest-per-doc) and the schema's idempotent IF-NOT-EXISTS statements are asserted directly.
 */
const createMock = jest.fn();
const findByPkMock = jest.fn();
const findOneMock = jest.fn();
const findAllMock = jest.fn();
const updateMock = jest.fn();
const queryMock = jest.fn().mockResolvedValue([]);

jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: any[]) => queryMock(...a) } }));
jest.mock('../../../../models/GovProposalReviewRun', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => createMock(...a),
    findByPk: (...a: any[]) => findByPkMock(...a),
    findOne: (...a: any[]) => findOneMock(...a),
    findAll: (...a: any[]) => findAllMock(...a),
    update: (...a: any[]) => updateMock(...a),
  },
}));

import { createRun, updateRun, getRun, activeRunForDoc, latestRunsForDocs } from '../govProposalReviewRunStore';
import { ensureGovProposalReviewRunsSchema } from '../../../../db/ensureGovProposalReviewRunsSchema';

const plain = (v: Record<string, unknown>) => ({ get: () => ({ ...v }) });

beforeEach(() => jest.clearAllMocks());

describe('ensureGovProposalReviewRunsSchema — additive + idempotent', () => {
  it('runs only CREATE/INDEX ... IF NOT EXISTS statements, FK to gov_proposal_documents', async () => {
    await ensureGovProposalReviewRunsSchema();
    const sqls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.length).toBe(2);
    expect(sqls[0]).toMatch(/CREATE TABLE IF NOT EXISTS gov_proposal_review_runs/);
    expect(sqls[0]).toMatch(/REFERENCES gov_proposal_documents\(id\) ON DELETE CASCADE/);
    expect(sqls[1]).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(sqls.every((s) => /IF NOT EXISTS/.test(s))).toBe(true);
  });
});

describe('govProposalReviewRunStore', () => {
  it('createRun inserts a running row and returns its id', async () => {
    createMock.mockResolvedValue({ id: 'run-1' });
    expect(await createRun('doc-1')).toEqual({ id: 'run-1' });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ document_id: 'doc-1', status: 'running', iterations: 0 }));
  });

  it('activeRunForDoc returns the running run, else null', async () => {
    findOneMock.mockResolvedValueOnce(plain({ id: 'run-1', document_id: 'doc-1', status: 'running', iterations: 1, last_message: 'x', started_at: new Date(), finished_at: null }));
    const a = await activeRunForDoc('doc-1');
    expect(a?.status).toBe('running');
    expect(findOneMock).toHaveBeenCalledWith(expect.objectContaining({ where: { document_id: 'doc-1', status: 'running' } }));
    findOneMock.mockResolvedValueOnce(null);
    expect(await activeRunForDoc('doc-2')).toBeNull();
  });

  it('updateRun stamps finished_at on a terminal status', async () => {
    await updateRun('run-1', { status: 'passed', iterations: 3, lastMessage: 'done' });
    const [fields] = updateMock.mock.calls[0];
    expect(fields.status).toBe('passed');
    expect(fields.iterations).toBe(3);
    expect(fields.last_message).toBe('done');
    expect(fields.finished_at).toBeInstanceOf(Date);
  });

  it('updateRun does NOT stamp finished_at for a non-terminal progress update', async () => {
    await updateRun('run-1', { iterations: 1, lastMessage: 'iter 1' });
    const [fields] = updateMock.mock.calls[0];
    expect(fields.finished_at).toBeUndefined();
    expect(fields.iterations).toBe(1);
  });

  it('getRun maps a row to a view with ISO timestamps', async () => {
    findByPkMock.mockResolvedValue(plain({ id: 'run-1', document_id: 'doc-1', status: 'done', iterations: 2, last_message: null, started_at: new Date('2026-11-05T00:00:00Z'), finished_at: new Date('2026-11-05T00:01:00Z') }));
    const v = await getRun('run-1');
    expect(v).toMatchObject({ id: 'run-1', documentId: 'doc-1', status: 'done', iterations: 2 });
    expect(v?.finishedAt).toBe('2026-11-05T00:01:00.000Z');
  });

  it('latestRunsForDocs groups newest-first (one per document) and skips the query when empty', async () => {
    expect((await latestRunsForDocs([])).size).toBe(0);
    expect(findAllMock).not.toHaveBeenCalled();
    findAllMock.mockResolvedValue([
      plain({ id: 'r2', document_id: 'doc-1', status: 'running', iterations: 1, started_at: new Date('2026-11-05T02:00:00Z') }),
      plain({ id: 'r1', document_id: 'doc-1', status: 'failed', iterations: 2, started_at: new Date('2026-11-05T01:00:00Z') }),
      plain({ id: 'r3', document_id: 'doc-2', status: 'passed', iterations: 1, started_at: new Date('2026-11-05T03:00:00Z') }),
    ]);
    const map = await latestRunsForDocs(['doc-1', 'doc-2']);
    expect(map.get('doc-1')?.id).toBe('r2'); // newest-first ⇒ first seen per doc is the latest
    expect(map.get('doc-2')?.id).toBe('r3');
    expect(map.size).toBe(2);
  });
});
