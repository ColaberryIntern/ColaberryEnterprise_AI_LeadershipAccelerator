jest.mock('../../../intelligenceProxyService', () => ({
  intelligenceProxy: { embedText: jest.fn() },
}));

import { retrieveRelevantChunks } from '../govProposalSources';
import { intelligenceProxy } from '../../../intelligenceProxyService';

const embedText = intelligenceProxy.embedText as jest.Mock;

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
