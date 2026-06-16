import crypto from 'crypto';

// ─── Stubs ────────────────────────────────────────────────────────────────────

jest.mock('../../models', () => ({
  GitHubConnection: { findOrCreate: jest.fn(), findOne: jest.fn() },
  StudentGithubActivity: { findOne: jest.fn(), create: jest.fn() },
}));

const { GitHubConnection, StudentGithubActivity } = require('../../models');

// Re-import after mocks
import {
  buildOAuthUrl,
  validateWebhookSignature,
  findEnrollmentByRepo,
} from '../githubIntegrationService';

// ─── buildOAuthUrl ────────────────────────────────────────────────────────────

describe('buildOAuthUrl', () => {
  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_OAUTH_REDIRECT_URI = 'https://example.com/api/portal/github/oauth/callback';
  });

  it('returns a GitHub authorize URL containing client_id, scope=repo, and state=enrollmentId', () => {
    const url = buildOAuthUrl('enrollment-abc');
    expect(url).toContain('github.com/login/oauth/authorize');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('scope=repo');
    expect(url).toContain('state=enrollment-abc');
  });
});

// ─── validateWebhookSignature ─────────────────────────────────────────────────

describe('validateWebhookSignature', () => {
  const secret = 'webhook-secret';
  const body = Buffer.from('{"action":"push"}');

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
  });

  it('returns true for a valid signature', () => {
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(validateWebhookSignature(body, sig)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(validateWebhookSignature(body, 'sha256=badhash')).toBe(false);
  });

  it('returns false when GITHUB_WEBHOOK_SECRET is not set', () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(validateWebhookSignature(body, sig)).toBe(false);
  });

  it('returns false when signature is empty string', () => {
    expect(validateWebhookSignature(body, '')).toBe(false);
  });
});

// ─── findEnrollmentByRepo ─────────────────────────────────────────────────────

describe('findEnrollmentByRepo', () => {
  it('returns enrollment_id when a matching connection exists', async () => {
    GitHubConnection.findOne.mockResolvedValue({ enrollment_id: 'enroll-xyz' });
    const result = await findEnrollmentByRepo('owner', 'repo');
    expect(result).toBe('enroll-xyz');
    expect(GitHubConnection.findOne).toHaveBeenCalledWith({
      where: { repo_owner: 'owner', repo_name: 'repo' },
    });
  });

  it('returns null when no connection matches', async () => {
    GitHubConnection.findOne.mockResolvedValue(null);
    const result = await findEnrollmentByRepo('unknown', 'repo');
    expect(result).toBeNull();
  });
});
