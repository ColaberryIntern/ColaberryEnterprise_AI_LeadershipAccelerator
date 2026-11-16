jest.mock('../../../intelligenceProxyService', () => ({
  intelligenceProxy: { embedText: jest.fn() },
}));
const queryMock = jest.fn();
const docFindAll = jest.fn();
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: any[]) => queryMock(...a) } }));
jest.mock('../../../../models/GovProposalSourceDocument', () => ({ __esModule: true, default: { findAll: (...a: any[]) => docFindAll(...a) } }));

import { retrieveRelevantChunks, listCompanyDocuments } from '../govProposalSources';
import { intelligenceProxy } from '../../../intelligenceProxyService';

const embedText = intelligenceProxy.embedText as jest.Mock;
const vec = () => Array.from({ length: 1536 }, () => 0.01);

describe('listCompanyDocuments', () => {
  it('reads tenant-wide documents only (project_id IS NULL, scoped to the tenant)', async () => {
    docFindAll.mockResolvedValue([]);
    await listCompanyDocuments('t1');
    expect(docFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { project_id: null, tenant_id: 't1' } }));
  });
});

describe('retrieveRelevantChunks — tenant-wide union', () => {
  afterEach(() => { embedText.mockReset(); queryMock.mockReset(); });

  it('passes the tenant so company documents (project_id NULL) are searched alongside the project', async () => {
    embedText.mockResolvedValue({ data: { embedding: vec() } });
    queryMock.mockResolvedValue([{ document_id: 'd1', document_name: 'capability.pdf', chunk_index: 0, text: 'ISO 9001 certified', similarity: '0.9' }]);
    const out = await retrieveRelevantChunks('project-1', 'quality certifications', 8, 'tenant-1');
    expect(out).toEqual([{ documentId: 'd1', documentName: 'capability.pdf', chunkIndex: 0, text: 'ISO 9001 certified', similarity: 0.9 }]);
    const [, opts] = queryMock.mock.calls[0];
    expect(opts.replacements).toMatchObject({ pid: 'project-1', tid: 'tenant-1', k: 8 });
    expect(String(queryMock.mock.calls[0][0])).toMatch(/project_id IS NULL AND c\.tenant_id = :tid/);
  });

  it('passes tid=null when no tenant is given (project-only, backward compatible)', async () => {
    embedText.mockResolvedValue({ data: { embedding: vec() } });
    queryMock.mockResolvedValue([]);
    await retrieveRelevantChunks('project-1', 'anything');
    expect(queryMock.mock.calls[0][1].replacements).toMatchObject({ tid: null });
  });
});

describe('govProposalSources.retrieveRelevantChunks — graceful degrade when the embedding proxy is unavailable', () => {
  afterEach(() => embedText.mockReset());

  it('returns no excerpts (and never queries the DB) when the proxy yields no embedding', async () => {
    embedText.mockResolvedValue({ data: { embedding: null } });
    await expect(retrieveRelevantChunks('project-1', 'asset lifecycle condition audit trail')).resolves.toEqual([]);
  });

  it('returns no excerpts when the proxy throws', async () => {
    embedText.mockRejectedValue(new Error('proxy down'));
    await expect(retrieveRelevantChunks('project-1', 'public permit portal')).resolves.toEqual([]);
  });

  it('returns no excerpts when the embedding has the wrong dimension', async () => {
    embedText.mockResolvedValue({ data: { embedding: [0.1, 0.2, 0.3] } }); // not 1536
    await expect(retrieveRelevantChunks('project-1', 'caselle billing')).resolves.toEqual([]);
  });
});
