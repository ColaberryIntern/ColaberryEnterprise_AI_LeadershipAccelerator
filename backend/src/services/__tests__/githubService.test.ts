import { getRepoStatus } from '../githubService';
import { GitHubConnection } from '../../models';

jest.mock('../../models', () => ({
  GitHubConnection: { findOne: jest.fn() },
}));

const ENROLLMENT_ID = 'enrollment-uuid-1111';

describe('githubService.getRepoStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when no connection row exists', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue(null);

    const status = await getRepoStatus(ENROLLMENT_ID);

    expect(status).toBeNull();
  });

  it('reports connected:false, hasToken:true when OAuth completed but no repo was picked yet', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue({
      repo_url: null,
      repo_owner: null,
      repo_name: null,
      access_token_encrypted: 'token-abc',
      last_checked_at: null,
      status_json: {},
    });

    const status = await getRepoStatus(ENROLLMENT_ID);

    expect(status.connected).toBe(false);
    expect(status.hasToken).toBe(true);
  });

  it('reports connected:true once a repo is linked', async () => {
    (GitHubConnection.findOne as jest.Mock).mockResolvedValue({
      repo_url: 'https://github.com/kes/support-copilot',
      repo_owner: 'kes',
      repo_name: 'support-copilot',
      access_token_encrypted: 'token-abc',
      last_checked_at: new Date('2026-07-17T00:00:00Z'),
      status_json: {},
    });

    const status = await getRepoStatus(ENROLLMENT_ID);

    expect(status.connected).toBe(true);
    expect(status.hasToken).toBe(true);
    expect(status.repoOwner).toBe('kes');
    expect(status.repoName).toBe('support-copilot');
  });
});
