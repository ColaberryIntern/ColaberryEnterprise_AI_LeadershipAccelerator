jest.mock('../../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));

import api from '../../utils/api';
import { uploadProposalSource, listProposalSources, approveProposalSource, deleteProposalSource } from '../adminGovContractsApi';

// These assert the exact admin route + shape per call, so a regression that points the upload/approve at the wrong
// route (or drops the multipart header) fails here.
const m = api as unknown as { get: jest.Mock; post: jest.Mock; delete: jest.Mock };

beforeEach(() => {
  m.get.mockReset(); m.post.mockReset(); m.delete.mockReset();
  m.post.mockResolvedValue({ data: { ok: true, documentId: 'd1', chunkCount: 2, embeddedCount: 2, truncated: false, status: 'ready' } });
  m.get.mockResolvedValue({ data: { documents: [] } });
  m.delete.mockResolvedValue({ data: { ok: true } });
});

describe('proposal source library client → the admin sources routes', () => {
  it('uploadProposalSource POSTs multipart FormData to .../sources', async () => {
    const file = new File(['hi'], 'briefing.txt', { type: 'text/plain' });
    await uploadProposalSource('p1', file);
    expect(m.post).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/sources', expect.any(FormData), { headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('listProposalSources GETs .../sources', async () => {
    await listProposalSources('p1');
    expect(m.get).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/sources');
  });

  it('approveProposalSource POSTs .../sources/:id/approve with the approved flag', async () => {
    await approveProposalSource('p1', 'd1', true);
    expect(m.post).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/sources/d1/approve', { approved: true });
  });

  it('deleteProposalSource DELETEs .../sources/:id', async () => {
    await deleteProposalSource('p1', 'd1');
    expect(m.delete).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/sources/d1');
  });
});
