import { adminGovCockpitApi } from '../adminGovContractsApi';
import api from '../utils/api';

// The whole point of the admin adapter is that it posts to the ADMIN gov-contracts routes (admin token),
// NOT the student portal routes. These assert the exact URL + body for each action, so a regression that
// routes management's clicks to a participant-only portal endpoint fails here.
jest.mock('../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const mockedPost = (api as unknown as { post: jest.Mock }).post;

beforeEach(() => {
  mockedPost.mockReset();
  mockedPost.mockResolvedValue({ data: { document: { key: 'technical' }, intent: 'other', answer: 'ok' } });
});

describe('adminGovCockpitApi targets the admin gov-contracts routes', () => {
  it('askCopilot → /api/admin/gov-contracts/:id/copilot', async () => {
    mockedPost.mockResolvedValue({ data: { intent: 'other', answer: 'hi' } });
    await adminGovCockpitApi.askCopilot('p1', 'what next?');
    expect(mockedPost).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/copilot', { question: 'what next?' });
  });

  it('draftDocument (AI) → .../documents/:key/draft with an empty body', async () => {
    await adminGovCockpitApi.draftDocument('p1', 'technical');
    expect(mockedPost).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/documents/technical/draft', {});
  });

  it('draftDocument (manual) → .../draft carrying contentHtml', async () => {
    await adminGovCockpitApi.draftDocument('p1', 'technical', '<p>x</p>');
    expect(mockedPost).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/documents/technical/draft', { contentHtml: '<p>x</p>' });
  });

  it('acceptDocument → .../documents/:key/accept', async () => {
    await adminGovCockpitApi.acceptDocument('p1', 'technical');
    expect(mockedPost).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/documents/technical/accept', {});
  });

  it('requestChanges → .../documents/:key/request-changes carrying the note', async () => {
    await adminGovCockpitApi.requestChanges('p1', 'technical', 'fix it');
    expect(mockedPost).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/documents/technical/request-changes', { note: 'fix it' });
  });

  it('commentDocument → .../documents/:key/comment carrying the body', async () => {
    await adminGovCockpitApi.commentDocument('p1', 'technical', 'nice');
    expect(mockedPost).toHaveBeenCalledWith('/api/admin/gov-contracts/p1/documents/technical/comment', { body: 'nice' });
  });
});
